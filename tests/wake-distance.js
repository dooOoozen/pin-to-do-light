/* How close does the pointer have to come before the tucked dock wakes? Walk in from
   far away one step at a time and report the distance that actually popped it — the
   constants are not the evidence, the measured boundary is. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[W] ' + s); } catch (e) { /* no bridge */ } }
  var nd = window.__nd;
  if (!nd || !nd.cursorFrame) { note('FAIL no cursorFrame hook'); return; }

  setTimeout(function () {
    /* stop the host's own feed so only the frames pushed here move the deck */
    if (API.cursorWatch) API.cursorWatch(false);
    nd.autoTuck(false);
    note('start mode=' + nd.mode() + ' dock=' + JSON.stringify(nd.dockRect()));
    var steps = [220, 160, 120, 90, 70, 55, 44, 36, 30, 24, 18, 14, 10, 4, 0];
    (function step(i) {
      if (i >= steps.length) { report(); return; }
      probe(steps[i], function (woke) {
        note('d=' + steps[i] + ' woke=' + woke);
        setTimeout(function () { step(i + 1); }, 60);
      });
    })(0);
  }, 1600);

  function probe(d, cb) {
    nd.tuck(true);
    /* a far frame first, so the "crossing" edge is always cold */
    nd.cursorFrame(20, 300, false);
    setTimeout(function () {
      var r = nd.dockRect();
      if (!r) { cb(false); return; }
      nd.cursorFrame(r.left - d, (r.top + r.bottom) / 2, false);
      setTimeout(function () { cb(nd.hoverInfo().tucked === false); }, 150);
    }, 150);
  }

  function report() {
    nd.tuck(true);
    note('done; restored feed');
    if (API.cursorWatch) API.cursorWatch(true);
  }
})();
