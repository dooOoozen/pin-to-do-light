/* The band is painted over the top of this window while it is the active window, and the
   window region is the only thing that decides whether those pixels reach the screen. So the
   assertion is about the region: while a modal holds the activation, the claim must start
   below the caption; when the modal lets go, it must cover the top again.
   `pushed()` is read rather than the builder's intent — the clip lives in the push. */
(function () {
  var API = window.API;
  var nd = window.__nd || {};
  function note(s) { try { API.bootNote('[C] ' + s); } catch (e) { /* no bridge */ } }
  function q(sel) { return document.querySelector(sel); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var BAND = Math.ceil(32 * (window.devicePixelRatio || 1)) + 2;
  var fails = [];
  function check(name, ok, detail) {
    note((ok ? 'ok   ' : 'FAIL ') + name + ' · ' + detail);
    if (!ok) fails.push(name);
  }
  function topOf(spans) {
    if (spans === null) return -1;
    var t = 1e9;
    (spans || []).forEach(function (r) { if (r.y < t) t = r.y; });
    return t;
  }

  note('dpr=' + (window.devicePixelRatio || 1) + ' band=' + BAND + ' shapeOn=' + nd.shapeOn());
  setTimeout(function () {
    var face = q('#deckFace');
    if (!face) { note('RESULT ERROR no deck face'); return; }
    face.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  }, 900);

  /* activation is what composes the band, so the whole test is only meaningful if the layer
     really is the active window here — hasFocus is the page's own view of that */
  wait(2600).then(function () {
    /* the host is the only witness to activation: `document.hasFocus()` answers false here
       even when the layer is the foreground window, which is what the first cut of this
       test keyed the clip to and why it never engaged */
    return API.frameReport().then(function (rep) {
      var layer = /layer hwnd=(0x[0-9A-F]+)/.exec(rep);
      var fg = /fg hwnd=(0x[0-9A-F]+)/.exec(rep);
      check('modal open and the layer holds the activation',
        !!q('#modalRoot.open') && !!layer && !!fg && layer[1] === fg[1],
        'modal=' + !!q('#modalRoot.open') + ' layer=' + (layer ? layer[1] : '?') +
        ' fg=' + (fg ? fg[1] : '?') + ' hasFocus=' + document.hasFocus());
      var spans = nd.pushed ? nd.pushed() : null;
      var top = topOf(spans);
      check('region starts below the caption', top >= BAND,
        'top=' + top + ' band=' + BAND + ' spans=' + (spans === null ? 'FULL' : JSON.stringify(spans)));
      check('the top strip is not ours any more', nd.swallowsAt(600, 4) === false,
        'swallowsAt(600,4)=' + nd.swallowsAt(600, 4));
      check('the screen below it still is', nd.swallowsAt(600, BAND + 60) === true,
        'swallowsAt(600,' + (BAND + 60) + ')=' + nd.swallowsAt(600, BAND + 60));
      note('HELD for the screenshotter');
      return wait(4200);
    });
  }).then(function () {
    var cancel = q('#modalRoot.open [data-act="cancel"]');
    if (cancel) cancel.click();
    return wait(1400);
  }).then(function () {
    var spans = nd.pushed ? nd.pushed() : null;
    /* the claim shrinks back to the content once the modal is gone, so "the top is covered
       again" is the wrong thing to assert here — what has to be true is that the layer stops
       owning the corner of the screen it only claimed for the modal */
    check('modal closed, the whole-window claim is gone',
      nd.swallowsAt(4, 4) === false,
      'swallowsAt(4,4)=' + nd.swallowsAt(4, 4) + ' spans=' +
      (spans === null ? 'FULL' : spans.length) + ' hasFocus=' + document.hasFocus());
    /* the scatter claims the whole window as well, and that is where the band was still
       showing after the first cut of the clip was gated to modals. 'd' is the app's own
       shortcut, so this is the same path a person takes. */
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    return wait(1000);
  }).then(function () {
    var spans = nd.pushed ? nd.pushed() : null;
    var lag = nd.lag ? nd.lag() : null;
    check('scatter: the top strip is not claimed either',
      nd.mode() === 'deployed' && nd.swallowsAt(600, 4) === false,
      'mode=' + nd.mode() + ' top=' + topOf(spans) + ' swallowsAt(600,4)=' + nd.swallowsAt(600, 4));
    check('scatter: nothing that paints was left outside the region',
      !lag || lag === 'covered' || (lag.length === 0), 'lag=' + JSON.stringify(lag).slice(0, 180));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    return wait(700);
  }).then(function () {
    note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(', ') : 'PASS'));
  }).catch(function (e) {
    note('RESULT ERROR ' + (e && e.message));
  });
})();
