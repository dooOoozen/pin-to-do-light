/* Pressing FEED while the machine is printing must do nothing.
   The sheet is torn off before the re-print starts, and tearing one that has only half
   emerged leaves a ragged head above the machine with the new sheet feeding under it — the
   picture the user photographed. So the button is ignored while the motor runs, and the
   assertion is about identity: the same canvas node, no second rig, no tear flag — and then
   that the very same click *does* reprint once the feed has finished, so the guard is a
   pause and not a dead button. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function paper() { return document.querySelector('.rcp-paper'); }
  function state(tag) {
    var p = paper();
    var mr = document.querySelector('.rcp-machine');
    var pr = p && p.getBoundingClientRect(), r = mr && mr.getBoundingClientRect();
    return tag + ' rigs=' + document.querySelectorAll('.rcp').length +
      ' paper=' + (p ? (p.__id || 'fresh') : 'none') +
      ' aboveHead=' + (pr && r ? Math.round(pr.top - r.bottom) : '?') +
      ' torn=' + String(window.__rcpTear === true);
  }

  setTimeout(function () {
    if (!window.Receipt) { note('Receipt missing'); return; }
    var first = null;
    API.getState().then(function (st) {
      window.Receipt.open(st);
      var p = paper();
      /* tag the node so "the same canvas" is a fact rather than a guess */
      if (p) { p.__id = 'A'; first = p; }
      return wait(400);
    }).then(function () {
      note(state('mid-feed   '));
      document.querySelector('[data-rcp="again"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }));
      return wait(300);
    }).then(function () {
      note(state('afterFeedBtn'));
      note('sameNode=' + (paper() === first) + ' toast=' +
        !!document.querySelector('.toast, .toast-root *'));
      return wait(2600);
    }).then(function () {
      note(state('settled    '));
      document.querySelector('[data-rcp="again"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }));
      return wait(500);
    }).then(function () {
      note(state('realReprint'));
      note('rebuilt=' + (paper() !== first));
      return wait(3200);
    }).then(function () {
      note(state('final      '));
      var c = document.querySelector('[data-rcp="close"]');
      if (c) c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }).catch(function (e) { note('ERR ' + (e && e.message ? e.message : e)); });
  }, 1500);
})();
