/* The band is composed when the layer becomes the active window, so the fix is to refuse
   activation except while a modal needs the keyboard. This asserts the door actually opens
   and shuts, from the window's own point of view:

     1. at rest        WS_EX_NOACTIVATE on, and the layer is not the foreground window
     2. modal open     the bit off, the layer IS the foreground window, and the input inside
                       it holds the DOM focus — which is what a real keystroke needs
     3. modal closed   the bit back on, the modal gone

   Step 2 is the one that can fail quietly: a window that refuses activation gives its web
   view no keyboard, so a fix that stops the band and kills typing is not a fix. Nothing is
   saved and the store is untouched — 取消 closes the modal without an op. */
(function () {
  var API = window.API;
  var NOACT = 0x08000000;
  function note(s) { try { API.bootNote('[F] ' + s); } catch (e) { /* no bridge */ } }
  function q(sel) { return document.querySelector(sel); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* "layer hwnd=0x1234 class=... ex=0x000800B8 ... | fg hwnd=0x1234 ..." → the two facts
     this test needs, plus nc, which is the number the band refuses to move and is printed
     here only so a future reading has it */
  function read() {
    return API.frameReport().then(function (rep) {
      var layer = /layer hwnd=(0x[0-9A-F]+)[^|]*?nc=(-?\d+)[^|]*?ex=(0x[0-9A-F]+)/.exec(rep);
      var fg = /fg hwnd=(0x[0-9A-F]+)/.exec(rep);
      return {
        hwnd: layer ? layer[1] : '?',
        nc: layer ? +layer[2] : -999,
        ex: layer ? parseInt(layer[3], 16) : 0,
        fg: fg ? fg[1] : '-',
        raw: rep
      };
    });
  }

  var fails = [];
  function check(name, ok, detail) {
    note((ok ? 'ok   ' : 'FAIL ') + name + ' · ' + detail);
    if (!ok) fails.push(name);
  }

  read().then(function (r) {
    check('rest: refuses activation', (r.ex & NOACT) !== 0,
      'ex=0x' + (r.ex >>> 0).toString(16) + ' nc=' + r.nc + ' fg=' + r.fg + '/' + r.hwnd);
    /* dblclick on the deck face is the same gesture the person makes; no internal call */
    var face = q('#deckFace');
    if (!face) throw new Error('no deck face to open a modal from');
    face.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    return wait(600);
  }).then(function () {
    /* openModal asks for focus, then the modal's own onMount focuses the input after 40 ms;
       both have to have landed by now */
    return Promise.all([read(), wait(0)]);
  }).then(function (pair) {
    var r = pair[0];
    var input = q('#qText');
    check('modal: takes activation', (r.ex & NOACT) === 0,
      'ex=0x' + (r.ex >>> 0).toString(16));
    check('modal: is the foreground window', r.fg === r.hwnd, 'fg=' + r.fg + ' layer=' + r.hwnd);
    check('modal: the input can be typed in',
      !!input && document.hasFocus() && document.activeElement === input,
      'input=' + !!input + ' hasFocus=' + document.hasFocus() +
      ' active=' + (document.activeElement || {}).tagName + '#' + (document.activeElement || {}).id);
    var cancel = q('#modalRoot.open [data-act="cancel"]');
    if (!cancel) throw new Error('quick-add modal did not open');
    cancel.click();
    return wait(700);
  }).then(function () {
    return read();
  }).then(function (r) {
    check('closed: refuses activation again', (r.ex & NOACT) !== 0,
      'ex=0x' + (r.ex >>> 0).toString(16) + ' nc=' + r.nc);
    /* the half that the ex bit alone does not do: taking the bit away does not deactivate a
       window that is already active, and an active layer is a layer DWM keeps repainting the
       caption into. So the activation has to go back where it came from. */
    check('closed: gave the activation back', r.fg !== r.hwnd, 'fg=' + r.fg + ' layer=' + r.hwnd);
    check('closed: the modal is gone', !q('#modalRoot.open'), 'modalRoot.open=' + !!q('#modalRoot.open'));
    note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(', ') : 'PASS'));
  }).catch(function (e) {
    note('RESULT ERROR ' + (e && e.message));
  });
})();
