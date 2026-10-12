/* Logs every deck state change with a timestamp so a real pointer, driven by
   tools/approach.ps1, can be compared against tests/rehover.js. The scripted phases reproduce
   the recall bug and its fix; this checks the same behaviour with the host's own cursor feed,
   the live window region and the real hit test in the path.

   Run on the second display and drive the pointer:
     pin-tauri.exe --monitor 2 --test-script tests/rehover-real.js
     .\tools\approach.ps1 -CenterX 1936 -CenterY 431 -Clicks 2 -Return true */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[X] ' + s); } catch (e) { /* no bridge */ } }
  function r(n) { return Math.round(n); }
  var last = '', t0 = performance.now();

  function snap() {
    var h = nd.hoverInfo();
    var d = nd.dockRect();
    var hit = nd.lastHit() || {};
    var pt = hit.pt || { x: -1, y: -1 };
    var box = d ? [r(d.left), r(d.top), r(d.right), r(d.bottom)].join(',') : '-';
    return h.mode + '|' + (h.tucked ? 'tucked' : 'out') + '|' + (h.armed ? 'armed' : 'DISARMED') +
      '|' + box + '|guard=' + r(h.popGuardIn) + '|tuckGuard=' + r(h.tuckGuardIn) +
      '|rearmIn=' + r(h.rearmIn) + '|ptr=' + r(pt.x) + ',' + r(pt.y) +
      '|hit=' + (hit.candidate ? (hit.interactive ? 'ours' : 'through') : 'empty');
  }

  setInterval(function () {
    var s = snap();
    if (s !== last) {
      note('t+' + r(performance.now() - t0) + 'ms ' + s);
      last = s;
    }
  }, 16);

  setTimeout(function () {
    note('READY ' + snap() + ' cards=' + document.querySelectorAll('.todo-card').length);
  }, 2200);
})();
