/* Where does the title actually sit inside a simplified card?
   "上下位置居中" is a claim about free space inside the sheet, and the sheet is sized by
   its content (`min-height: calc(var(--ch, 0px) …)`, and --ch is never written by the JS),
   so the honest first step is to measure the boxes rather than add a centring rule that may
   have nothing to centre in. This prints, in both modes and with the switch both ways: the
   card box, its children's boxes, and the gap between the title block and the card edge.

   A temporary task is created because the deck may hold no cards at all, and it is deleted
   again at the end. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[G] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var TITLE = '临时测量标题 TEMP MEASURE';

  function dump(tag) {
    var c = document.querySelector('.todo-card:not(.docked)') || document.querySelector('.todo-card');
    if (!c) { note(tag + ' NO CARD'); return; }
    var b = c.querySelector('.card-body'), t = c.querySelector('.card-title');
    var cs = getComputedStyle(c), cr = c.getBoundingClientRect(), br = b ? b.getBoundingClientRect() : null;
    note(tag + ' simple=' + document.body.classList.contains('simple') + ' mode=' + nd.mode() +
      ' card=' + Math.round(cr.width) + 'x' + Math.round(cr.height) +
      ' body=' + (br ? Math.round(br.width) + 'x' + Math.round(br.height) : '—') +
      /* the two numbers the complaint is about: the free space above and below the only
         in-flow child. Equal means centred, whatever the min-height was sized from. */
      ' gap ' + (br ? Math.round(br.top - cr.top) : '?') + '/' + (br ? Math.round(cr.bottom - br.bottom) : '?') +
      ' minH=' + cs.minHeight + ' justify=' + cs.justifyContent + ' disp=' + cs.display +
      ' title=' + (t ? Math.round(t.getBoundingClientRect().height) + 'px/' + getComputedStyle(t).textAlign : '—'));
  }

  var dock = document.getElementById('dock');
  var tempId = null, wasSimple = false;
  Promise.resolve(API.getState()).then(function (st) {
    wasSimple = st.settings.simple === true;
    return API.op({
      type: 'todo:add', title: TITLE, notes: '备注两行：测量用的自由空间。second line of notes.',
      groupId: st.settings.activeGroupId, priority: 'high',
      repeat: 'weekly', dueAt: new Date(Date.now() + 864e5).toISOString()
    });
  }).then(function () { return wait(400); }).then(function () { return API.getState(); })
  .then(function (st) {
    var mine = (st.todos || []).filter(function (t) { return t.title === TITLE; })[0];
    tempId = mine && mine.id;
    note('temp=' + (tempId || 'FAILED'));
    var c = dock.getBoundingClientRect();
    nd.cursorFrame(Math.round(c.left + c.width / 2), Math.round(c.top + c.height / 2), false);
    return wait(150).then(function () {
      nd.cursorFrame(Math.round(c.left + c.width / 2), Math.round(c.top + c.height / 2), true);
      return wait(900);
    });
  }).then(function () {
    dump('overview/full');
    return API.op({ type: 'settings:update', patch: { simple: true } });
  }).then(function () { return wait(600); }).then(function () {
    dump('overview/simple');
    /* the scattered sheet is the one the complaint is about, and its height comes from a
       min-height (--ch, 196px by default), so measure it in the mode that has the empty
       space rather than assuming the compact chip behaves the same way */
    document.getElementById('deckFace').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return wait(1300);
  }).then(function () {
    dump('deployed/simple');
    return API.op({ type: 'settings:update', patch: { simple: false } });
  }).then(function () { return wait(700); }).then(function () {
    dump('deployed/full');
    var c = dock.getBoundingClientRect();
    nd.cursorFrame(Math.round(c.left + c.width / 2), Math.round(c.top + c.height / 2), false);
    return wait(200);
  }).then(function () {
    return API.op({ type: 'settings:update', patch: { simple: wasSimple } });
  }).then(function () {
    return API.op({ type: 'todo:delete', id: tempId });
  }).then(function () { return wait(500); }).then(function () { return API.getState(); })
  .then(function (st) {
    note('cleanup todos=' + (st.todos || []).length + ' simple=' + st.settings.simple +
      ' leftover=' + (st.todos || []).filter(function (t) { return t.title === TITLE; }).length);
  }).catch(function (e) { note('ERR ' + (e && e.message ? e.message : e)); });
})();
