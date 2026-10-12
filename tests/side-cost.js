/* What one sidebar width write actually costs, measured in the real panel.

   The lab page (tools/jank-lab.html) cannot answer this: with a few hundred plain rows every
   variant lands on the vsync floor at 8.3 ms, so the measurement says nothing. The panel has
   container queries, textures, a 372-cell heat grid and a zoom factor, so the cost has to be
   taken where it is paid.

   Two numbers per view: frames where every tick writes --side-w (what a drag does), and frames
   where nothing is written. The difference is the re-layout a drag buys itself per frame.

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/side-cost.js */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[S] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; }

  function frames(n, work) {
    return new Promise(function (res) {
      var t = [], last = performance.now(), i = 0;
      function step() {
        work(i++);
        var now = performance.now();
        t.push(now - last); last = now;
        if (i < n) requestAnimationFrame(step); else res(median(t));
      }
      requestAnimationFrame(step);
    });
  }

  function nav(t) {
    return Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
      .filter(function (x) { return (x.textContent || '').indexOf(t) >= 0; })[0];
  }

  function probe(tag) {
    var w0 = getComputedStyle(document.body).getPropertyValue('--side-w').trim() || '286px';
    var app = document.querySelector('.app');
    var inline0 = app ? app.style.gridTemplateColumns : '';
    function byVar(i) { document.body.style.setProperty('--side-w', (240 + (i % 10) * 14) + 'px'); }
    function byInline(i) {
      if (app) app.style.gridTemplateColumns = (240 + (i % 10) * 14) + 'px minmax(0, 1fr)';
    }
    return frames(60, function () {}).then(function (idle) {
      return frames(60, byVar).then(function (drag) {
        /* the same writes aimed at the grid element instead of an inherited custom property on
           <body>: if the cost is the document-wide style invalidation this is the one that moves */
        return frames(60, byInline).then(function (direct) {
          document.body.style.setProperty('--side-w', w0);
          if (app) app.style.gridTemplateColumns = inline0;
          note(tag + ' idle=' + idle.toFixed(2) + ' var=' + drag.toFixed(2) +
            ' inline=' + direct.toFixed(2) + ' | extra ' + (drag - idle).toFixed(2) +
            ' → ' + (direct - idle).toFixed(2) + ' ms per frame');
          return drag - direct;
        });
      });
    });
  }

  var was = null;
  Promise.resolve().then(function () { return wait(1600); })
    .then(function () { return API.getState(); })
    .then(function (st) { was = st.settings.uiScale; return wait(400); })
    .then(function () { if (nav('仪表盘')) nav('仪表盘').click(); return wait(900); })
    .then(function () { return probe('仪表盘'); })
    .then(function () { if (nav('全部任务')) nav('全部任务').click(); return wait(900); })
    .then(function () { return probe('全部任务'); })
    .then(function () { if (nav('时间线')) nav('时间线').click(); return wait(900); })
    .then(function () { return probe('时间线'); })
    .then(function () {
      var open = document.querySelector('.modal-root');
      note('note: modal-root present=' + !!open + ' uiScale=' + was);
      note('RESULT measured; compare extra ms per frame across the three views');
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
