/* "卡" in Chinese usually means 不跟手, not 掉帧 — and the frame probe already showed the
   deck paints at 120fps with nothing dropped. So measure the wait instead: the moment the
   pointer arrives over the deck, the moment the deck decides to open, and the moment it has
   actually finished moving. Three timestamps, and the gaps between them name the culprit.

   The deck listens for a real mousemove rather than being fed one synthetically, because the
   hit test is a window region: a dispatched MouseEvent would report an arrival at a pixel the
   pointer can never occupy. tools/approach.ps1 does the moving.

   Run on the second display:
     pin-tauri.exe --monitor 2 --test-script tests/open-latency.js
   then read the GEOM line and drive the pointer with tools/approach.ps1. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[O] ' + s); } catch (e) { /* no bridge */ } }
  function r(n) { return Math.round(n); }
  function dockBox() {
    var el = document.getElementById('dock');
    if (!el) return null;
    var b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height, right: b.right, bottom: b.bottom };
  }
  function report() {
    var b = dockBox();
    note('GEOM ' + JSON.stringify({ css: [innerWidth, innerHeight], dpr: devicePixelRatio,
      dock: b ? [r(b.x), r(b.y), r(b.w), r(b.h)] : null,
      mode: document.body.dataset.mode }));
  }

  var watching = false, wasOutside = false, arriveAt = 0, modeAt = 0, settleAt = 0;
  var lastBox = '', stillFor = 0, runs = 0, misses = 0;

  /* Arrival cannot come from a DOM mousemove: while the deck is collapsed or filed the layer
     is click-through, so the page receives no pointer events at all — the host polls
     GetCursorPos and forwards a {type:'cursor'} command, which is the only arrival signal
     that exists. Listening to anything else would measure a path nobody can produce.
     The gate is "was away, then crossed", not "has been away for 900ms": a hand travels, so
     every frame on the way in resets the outside clock and a dwell requirement filters out
     exactly the approaches worth measuring. */
  API.onCommand(function (cmd) {
    if (!cmd || cmd.type !== 'cursor') return;
    var b = dockBox();
    if (!b) return;
    var inside = cmd.x >= b.x && cmd.x <= b.right && cmd.y >= b.y && cmd.y <= b.bottom;
    var now = performance.now();
    if (!inside) { if (!watching) wasOutside = true; arriveAt = 0; return; }
    if (watching || arriveAt || !wasOutside) return;
    wasOutside = false;
    arriveAt = now;
    modeAt = 0; settleAt = 0; lastBox = ''; stillFor = 0;
    watching = true;
  });

  (function poll() {
    if (watching && arriveAt) {
      var t = performance.now();
      var mode = document.body.dataset.mode;
      if (!modeAt && mode !== 'collapsed') modeAt = t;
      if (modeAt) {
        var b = dockBox();
        var key = b ? [r(b.x), r(b.y), r(b.w), r(b.h)].join(',') : '';
        if (key === lastBox) {
          stillFor += 1;
          /* the open is over once the box has not moved for 5 frames in a row */
          if (stillFor >= 5 && !settleAt) {
            settleAt = t;
            watching = false;
            runs++;
            note('OPEN #' + runs +
              ' arrive→mode=' + (modeAt - arriveAt).toFixed(0) + 'ms' +
              ' mode→settled=' + (settleAt - modeAt).toFixed(0) + 'ms' +
              ' total=' + (settleAt - arriveAt).toFixed(0) + 'ms');
          }
          lastBox = key;
        } else { stillFor = 0; lastBox = key; }
      }
      /* the pointer is parked and nothing has opened: that is the failure this rig
         exists to catch, so count it instead of silently timing out */
      if (!modeAt && t - arriveAt > 2000) {
        watching = false; misses++;
        note('MISS #' + misses + ' parked ' + (t - arriveAt).toFixed(0) +
          'ms with mode=' + document.body.dataset.mode);
      }
    }
    setTimeout(poll, 8);
  })();

  setTimeout(function () { report(); note('ARMED'); }, 2600);
  setInterval(report, 15000);
})();
