/* How long the task panel takes to answer.

   The deck turned out not to be the problem — 120 fps with the cursor feed running at 60
   events a second, and turning the feed off changed nothing. What people actually call 卡 is
   the panel: click a view and the screen does not change yet. So measure that directly — the
   interval between dispatching a click and the next frame the browser paints after it, which
   is the same thing a person waits through.

   Synthetic clicks are legitimate here and only here: the panel is an ordinary DOM window,
   so a dispatched click travels the same path a real one does. The card layer is a window
   region and would not be, which is why that one gets a real cursor.

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/panel-latency.js */
(function () {
  var API = window.API;
  var out = [];
  function note(s) { try { API.bootNote('[L] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function nextPaint() {
    return new Promise(function (r) {
      requestAnimationFrame(function () { requestAnimationFrame(r); });
    });
  }
  function navButton(text) {
    var host = document.getElementById('nav') || document.querySelector('.side-nav, nav');
    var pool = host ? host.querySelectorAll('button') : document.querySelectorAll('button');
    return Array.prototype.slice.call(pool).filter(function (b) {
      return (b.textContent || '').indexOf(text) >= 0;
    })[0];
  }
  /** one click → the next painted frame */
  function timed(label, fire) {
    var t0 = performance.now();
    fire();
    return nextPaint().then(function (t1) {
      var ms = t1 - t0;
      out.push({ label: label, ms: ms });
      note('LAT ' + label + ' = ' + ms.toFixed(1) + 'ms');
      return ms;
    });
  }

  var VIEWS = ['仪表盘', '时间轴', '时间账本', '月历', '全部任务', '已完成'];

  Promise.resolve()
    .then(function () { return wait(2600); })
    /* warm-up: the first switch of each kind pays for layout and font work that is not the
       app being slow, it is the browser being cold */
    .then(function () {
      var b = navButton('仪表盘');
      if (b) b.click();
      return wait(1500);
    })
    .then(function () {
      var chain = Promise.resolve();
      VIEWS.forEach(function (v) {
        chain = chain.then(function () {
          var b = navButton(v);
          if (!b) { note('MISSING nav button ' + v); return null; }
          b.click();                       /* warm it */
          return wait(400).then(function () { return nextPaint(); });
        }).then(function () { return wait(120); });
      });
      return chain;
    })
    /* now measure: back to a view, then switch into it again from cold DOM */
    .then(function () {
      var chain = Promise.resolve();
      VIEWS.forEach(function (v) {
        chain = chain.then(function () {
          var back = navButton('全部任务');
          if (back) back.click();
          return wait(350).then(function () { return nextPaint(); }).then(function () {
            return timed('view→' + v, function () {
              var b = navButton(v);
              if (b) b.click();
            });
          });
        });
      });
      return chain;
    })
    .then(function () {
      return timed('open settings', function () {
        document.getElementById('btnSettings').click();
      });
    })
    .then(function () { return wait(900); })
    .then(function () {
      return timed('close settings', function () {
        var c = document.querySelector('[data-act="cancel"], .modal-close');
        if (c) c.click(); else document.getElementById('btnSettings').click();
      });
    })
    .then(function () { return wait(700); })
    .then(function () {
      /* hovering a dashboard module: the CSS transition is cheap, but if the hover handler
         rebuilds anything this is where it shows */
      var b = navButton('仪表盘');
      if (b) b.click();
      return wait(900);
    })
    .then(function () {
      var mod = document.querySelector('.mod');
      if (!mod) { note('NO .mod to hover'); return null; }
      return timed('hover module', function () {
        mod.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        mod.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      });
    })
    .then(function () {
      var worst = out.slice().sort(function (a, b) { return b.ms - a.ms; }).slice(0, 5);
      var all = out.map(function (r) { return r.ms; }).sort(function (a, b) { return a - b; });
      note('SUMMARY n=' + all.length +
        ' p50=' + (all[Math.floor(all.length / 2)] || 0).toFixed(1) +
        ' max=' + (all[all.length - 1] || 0).toFixed(1));
      note('WORST ' + worst.map(function (r) { return r.label + '=' + r.ms.toFixed(1); }).join(' | '));
      note('DONE');
    })
    .catch(function (e) { note('ERROR ' + (e && e.message)); });
})();
