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
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/panel-latency.js

   What this found, so the next reader does not re-litigate it: view switches sit at the
   double-rAF floor (~16ms) and hovering a module costs ~9ms, so nothing here is janky. The one
   outlier is opening settings at ~140ms — and opening it a *second* time in the same process
   costs ~13ms, so it is cold work amortised over a session, not a stall in the code. */
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

  /* A millisecond number alone only says the click was slow, not why. Count the calls that
     force the browser to recalculate style between the click and the painted frame, so a
     drop in the time can be tied to a drop in the flushing instead of to the weather. */
  function counted(label, fire) {
    var gcs = window.getComputedStyle, gbr = Element.prototype.getBoundingClientRect;
    var reads = 0, rects = 0;
    window.getComputedStyle = function () { reads++; return gcs.apply(window, arguments); };
    Element.prototype.getBoundingClientRect = function () { rects++; return gbr.apply(this, arguments); };
    return timed(label, fire).then(function (ms) {
      window.getComputedStyle = gcs;
      Element.prototype.getBoundingClientRect = gbr;
      note('FLUSH ' + label + ' getComputedStyle=' + reads + ' rect=' + rects);
      return ms;
    }, function (e) {
      window.getComputedStyle = gcs;
      Element.prototype.getBoundingClientRect = gbr;
      throw e;
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
      return counted('open settings', function () {
        document.getElementById('btnSettings').click();
      });
    })
    .then(function () { return wait(900); })
    .then(function () {
      return timed('close settings', function () {
        var c = document.querySelector('[data-act="done"], [data-act="cancel"], .modal-close');
        if (c) c.click(); else document.getElementById('btnSettings').click();
      });
    })
    .then(function () { return wait(700); })
    /* The same click again in the same process. This is the number that says whether the
       ~140ms is work or *cold* work: I read a per-token variant measured after a batched one
       as 13ms against 140ms and almost "proved" the opposite of the truth. Anything compared
       across warm and cold is not a comparison — see tests/settings-cost.js, which varies
       what the modal builds and takes one cold open per launch. */
    .then(function () {
      return counted('open settings (again, warm)', function () {
        document.getElementById('btnSettings').click();
      });
    })
    .then(function () { return wait(900); })
    .then(function () {
      var c = document.querySelector('[data-act="done"], [data-act="cancel"], .modal-close');
      if (c) c.click();
      return nextPaint();
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
