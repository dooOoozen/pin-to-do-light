/* Where the frame budget actually goes when the pointer moves.

   The cursor feed polls at 16 ms and forwards every move it sees, so the renderer can be
   handed up to ~60 events a second, each of which re-runs the hit test. Whether that is what
   "用起来卡卡的" means is a number, not an opinion: sample requestAnimationFrame deltas while
   a real cursor sweeps across the second display, once with the feed on and once with it off,
   and compare. Same machine, same sweep, same window — only the feed differs.

   p95 and the count of frames over 32 ms are the two that matter: a dropped frame is what a
   person calls 卡. The feed counter comes from the host, so the event rate is measured rather
   than assumed from the poll interval.

   Run on the second display, with tools/mousesweep.ps1 moving the pointer at the same time:
     pin-tauri.exe --monitor 2 --test-script tests/frame-probe.js */
(function () {
  var API = window.API;
  var WINDOW_MS = 12000;
  function note(s) { try { API.bootNote('[F] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function pct(sorted, p) {
    if (!sorted.length) return -1;
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  }

  function sample(label) {
    return new Promise(function (resolve) {
      var deltas = [];
      var prev = performance.now();
      var t0 = prev;
      var raf = function (now) {
        deltas.push(now - prev);
        prev = now;
        if (now - t0 < WINDOW_MS) requestAnimationFrame(raf);
        else resolve(deltas);
      };
      requestAnimationFrame(raf);
    }).then(function (deltas) {
      /* the first few frames always look terrible: the sweep has not reached the deck yet */
      var d = deltas.slice(5).sort(function (a, b) { return a - b; });
      var over = d.filter(function (x) { return x > 32; }).length;
      var mean = d.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, d.length);
      note('FRAME ' + label + ' n=' + d.length +
        ' p50=' + pct(d, 0.5).toFixed(1) +
        ' p95=' + pct(d, 0.95).toFixed(1) +
        ' max=' + (d[d.length - 1] || 0).toFixed(1) +
        ' mean=' + mean.toFixed(1) +
        ' over32ms=' + over + ' (' + (100 * over / Math.max(1, d.length)).toFixed(1) + '%)' +
        ' fps=' + (1000 / Math.max(0.001, mean)).toFixed(1));
      return { label: label, p95: pct(d, 0.95), over: over, n: d.length };
    });
  }

  function feed() {
    return Promise.resolve(API.feedStats ? API.feedStats() : null).then(function (f) {
      return f || { emitted: 0 };
    });
  }

  Promise.resolve()
    .then(function () { return wait(2500); })
    .then(function () { return feed(); })
    .then(function (f0) {
      base = f0.emitted || 0;
      note('phase A: feed ON');
      return sample('on');
    })
    .then(function (a) {
      return feed().then(function (f1) {
        note('RATE on: emitted+=' + (f1.emitted - base) + ' over ' + (WINDOW_MS / 1000) + 's = ' +
          ((f1.emitted - base) / (WINDOW_MS / 1000)).toFixed(1) + '/s');
        results.push(a);
        note('phase B: feed OFF');
        API.cursorWatch(false);
        var b0 = f1.emitted || 0;
        return sample('off').then(function (b) {
          return feed().then(function (f2) {
            note('RATE off: emitted+=' + (f2.emitted - b0));
            results.push(b);
            API.cursorWatch(true);
          });
        });
      });
    })
    .catch(function (e) { note('ERROR ' + (e && e.message)); })
    .then(function () {
      var on = results.filter(function (r) { return r.label === 'on'; })[0];
      var off = results.filter(function (r) { return r.label === 'off'; })[0];
      if (on && off) {
        note('VERDICT p95 ' + on.p95.toFixed(1) + ' -> ' + off.p95.toFixed(1) +
          ' ms, dropped frames ' + on.over + ' -> ' + off.over +
          ' (feed off is the floor: whatever remains is not the feed)');
      }
      note('DONE');
    });
  var base = 0, results = [];
})();
