/* The simplified-card switch moved onto the DECK band, which is inside the element whose
   own click means "scatter / recall". Two things can go wrong and both are measurable
   without watching an animation:

     - the deck root is pointer-events:none, so a control that is not a .tool has to ask
       for clicks back or the button is decorative;
     - the button's click must reach the switch and must NOT also toggle the spread.

   The click is dispatched on whatever elementFromPoint returns at the button's centre, not
   on the node we hope is there — dispatching on the button directly would pass even if the
   band swallowed it, which is how a previous "clickable" claim turned out to be false. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[S] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function simple() { return document.body.classList.contains('simple'); }
  function titleAlign() {
    var t = document.querySelector('.todo-card .card-title');
    if (!t) return 'no-title';
    var cs = getComputedStyle(t);
    /* the two declarations that make a centred title actually look centred: the face of
       the rule, and the 24px left margin the index number used to justify */
    var out = cs.textAlign + ' marginL=' + cs.marginLeft;
    var card = t.closest('.todo-card');
    if (card) {
      out += ' gap ' + (t.offsetLeft - card.offsetLeft) + '/' +
        Math.round(card.clientWidth - (t.offsetLeft - card.offsetLeft + t.offsetWidth));
    }
    return out;
  }

  var btn = document.getElementById('toolSimple');
  if (!btn) { note('FAIL no #toolSimple'); return; }
  var band = btn.closest('.deck-head');
  var b = btn.getBoundingClientRect();
  var cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
  var at = document.elementFromPoint(cx, cy);

  /* the settings value the test must leave exactly as it found it */
  var was = null, wasMode = nd.mode(), tempId = null;
  var dock = document.getElementById('dock');
  function centre() {
    var r = dock.getBoundingClientRect();
    return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
  }
  /* the card DOM is only built once the deck has been opened, so the alignment of a title
     has to be measured after a pop — measuring in the collapsed state reports no-title and
     proves nothing about the centring */
  function pop() {
    var c = centre();
    nd.cursorFrame(c[0], c[1], false);
    return wait(120).then(function () {
      nd.cursorFrame(c[0], c[1], true);
      return wait(900);
    });
  }

  Promise.resolve(API.getState()).then(function (st) {
    was = st.settings.simple === true;
    var open = (st.todos || []).filter(function (t) { return !t.done; }).length;
    note('at=' + b.width + 'x' + b.height + ' onBand=' + !!band +
      ' pe=' + getComputedStyle(btn).pointerEvents +
      ' hit=' + (at === btn ? 'self' : (at ? at.className || at.tagName : 'null')) +
      ' swallows=' + nd.swallowsAt(cx, cy) + ' simple=' + was + ' openBefore=' + open);
    /* a card has to exist to measure its title, and the deck may legitimately be empty —
       so add one temporary task with every badge on it (due date, priority, repeat), keep
       its id, and delete it again at the end */
    if (open) return null;
    return API.op({
      type: 'todo:add', title: '临时测量标题 TEMP MEASURE',
      groupId: st.settings.activeGroupId, priority: 'high',
      repeat: 'weekly', dueAt: new Date(Date.now() + 864e5).toISOString()
    }).then(function () { return wait(300); }).then(function () { return API.getState(); })
      .then(function (s2) {
        var mine = (s2.todos || []).filter(function (t) {
          return t.title === '临时测量标题 TEMP MEASURE';
        })[0];
        tempId = mine && mine.id;
        note('added temp=' + (tempId || 'FAILED'));
      });
  }).then(function () { return pop(); })
  .then(function () {
    note('popped mode=' + nd.mode() + ' cards=' +
      document.querySelectorAll('.todo-card:not(.docked)').length + ' align=' + titleAlign());
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    (at || btn).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return wait(600);
  }).then(function () {
    return API.getState();
  }).then(function (st) {
    note('afterClick simple=' + (st.settings.simple === true) + ' bodyClass=' + simple() +
      ' flipped=' + (st.settings.simple !== was) + ' on=' + btn.classList.contains('on') +
      ' mode=' + nd.mode() + '(was ' + wasMode + ')' + ' align=' + titleAlign() +
      ' leaks=' + nd.leaks());
    if (st.settings.simple === was) { note('FAIL the switch did not change the setting'); }
    /* leave the user's own value in place, and let it settle before reporting */
    return API.op({ type: 'settings:update', patch: { simple: was } });
  }).then(function () { return wait(500); }).then(function () {
    return API.getState();
  }).then(function (st) {
    note('restored value=' + st.settings.simple + ' wanted=' + was +
      ' bodyClass=' + simple() + ' on=' + btn.classList.contains('on') +
      ' align=' + titleAlign());
    if (tempId) return API.op({ type: 'todo:delete', id: tempId });
    return null;
  }).then(function () { return wait(400); }).then(function () {
    return API.getState();
  }).then(function (st) {
    var left = (st.todos || []).filter(function (t) {
      return t.title === '临时测量标题 TEMP MEASURE';
    }).length;
    note('cleanup tempLeft=' + left + ' todos=' + (st.todos || []).length);
  }).catch(function (e) { note('ERR ' + (e && e.message ? e.message : e)); });
})();
