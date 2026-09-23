/* Does an empty scatter still own the screen?
   The layer claims the whole work area in two states: an open modal, and the scatter where
   any click anywhere has to gather the cards back. Both are right when there is something
   on screen — and wrong in the degenerate case, which is reachable: deploy a group, then
   delete or complete the last card while the mode stays 'deployed'. The window is then
   transparent, claims every click on the display, and shows nothing of ours but the dock.
   That is "the desktop stopped answering clicks", and it is also the moment a restored
   WS_CAPTION becomes visible, because the region now covers the caption band too.

   The assertion is the one that matters to the user: a point on the desktop well away from
   the deck must NOT be swallowed. It is measured twice — with a card out, where claiming
   the screen is intended, and with the last card gone, where it must not be. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[E] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var TITLE = '临时测量空散布 TEMP EMPTY SCATTER';
  var dock = document.getElementById('dock'), tempId = null;

  /* a point in the middle of the desk, which is desktop as far as the user is concerned */
  function farPoint() {
    var w = window.innerWidth, h = window.innerHeight;
    return [Math.round(w * 0.25), Math.round(h * 0.5)];
  }
  function report(tag) {
    var p = farPoint();
    note(tag + ' mode=' + nd.mode() + ' loose=' +
      document.querySelectorAll('.todo-card:not(.docked)').length +
      ' swallowDesk=' + nd.swallowsAt(p[0], p[1]) + ' ' + nd.region());
  }

  Promise.resolve(API.getState()).then(function (st) {
    return API.op({
      type: 'todo:add', title: TITLE, groupId: st.settings.activeGroupId, priority: 'high'
    });
  }).then(function () { return wait(400); }).then(function () { return API.getState(); })
  .then(function (st) {
    tempId = ((st.todos || []).filter(function (t) { return t.title === TITLE; })[0] || {}).id;
    note('temp=' + (tempId || 'FAILED'));
    document.getElementById('deckFace').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return wait(1400);
  }).then(function () {
    report('withCard   ');
    return API.op({ type: 'todo:delete', id: tempId });
  }).then(function () { return wait(900); }).then(function () {
    /* the mode is not re-entered by hand: this is the state the user reaches by emptying a
       group while it is scattered, and it is the one that must not hold the screen */
    report('afterGone  ');
    return API.getState();
  }).then(function (st) {
    note('cleanup todos=' + (st.todos || []).length + ' mode=' + nd.mode() +
      ' leftover=' + (st.todos || []).filter(function (t) { return t.title === TITLE; }).length);
    nd.cursorFrame(20, 300, false);
  }).catch(function (e) { note('ERR ' + (e && e.message ? e.message : e)); });
})();
