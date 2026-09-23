/* Does the region now stay ahead of the cards it has to show?
   The clipped corner used to be chased: the region was re-cut every 40 ms against where a
   card had already been painted, with a 90 px band around it, so a fast flight outran it.
   The new path reads each card's destination off --tx/--ty/--rot/--sc and cuts one rect
   spanning the box and that destination before the card moves at all.

   Two things have to be true for that to be an improvement rather than a new bug:
     1. no painting card has a corner outside the spans that were handed to SetWindowRgn;
     2. the desktop area the layer claims while a pop is in flight is not larger than the
        pad-90 version it replaced — every claimed pixel is a pixel of desktop that cannot
        be clicked, so an exact region that swallows more screen is not the win it claims.

   Both old and new path are measured in one run of one build, in the same harness, by
   flipping window.__noFlyShape between two identical pops. Comparing against a number from
   last month's build would not be a comparison: the sampling rate, the card count and the
   monitor all move the result more than the change does. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[FL] ' + s); } catch (e) { /* no bridge */ } }
  var dock = document.getElementById('dock');

  function loose() {
    return Array.prototype.slice.call(document.querySelectorAll('.todo-card')).filter(function (c) {
      if (!c.offsetWidth || !c.offsetHeight) return false;
      var cs = getComputedStyle(c);
      if (cs.opacity === '0' || cs.visibility === 'hidden') return false;
      var b = c.getBoundingClientRect();
      return b.right > 0 && b.left < window.innerWidth && b.bottom > 0 && b.top < window.innerHeight;
    });
  }

  function claimK(spans) {
    if (!spans) return 0;
    var t = 0;
    spans.forEach(function (r) { t += r.width * r.height; });
    return Math.round(t / 1000);
  }

  function badCorners(spans) {
    var bad = 0, who = '';
    loose().forEach(function (c, i) {
      var b = c.getBoundingClientRect();
      [[b.left, b.top], [b.right - 0.5, b.top], [b.left, b.bottom - 0.5], [b.right - 0.5, b.bottom - 0.5]]
        .forEach(function (p) {
          var hit = spans.some(function (r) {
            return p[0] >= r.x && p[0] < r.x + r.width && p[1] >= r.y && p[1] < r.y + r.height;
          });
          if (!hit) { bad++; if (!who) who = 'card' + i + '@' + Math.round(p[0]) + ',' + Math.round(p[1]); }
        });
    });
    return { n: bad, who: who };
  }

  var s = null, log = [];
  function reset(label) {
    s = { label: label, frames: 0, miss: 0, worst: 0, worstAt: 0, max: 0, min: 1e9, at: Date.now() };
  }
  function report() {
    if (!s) return;
    note(s.label + ' frames=' + s.frames + ' missFrames=' + s.miss + ' worst=' + s.worst +
      '@' + s.worstAt + 'ms claimK max=' + s.max + ' rects=' + (nd.pushed() ? nd.pushed().length : 'null') +
      ' ' + nd.region());
    s = null;
  }
  function tick() {
    var spans = nd.pushed();
    if (s && spans) {
      s.frames++;
      var k = claimK(spans);
      if (k > s.max) s.max = k;
      var r = badCorners(spans);
      if (r.n) {
        s.miss++;
        if (r.n > s.worst) { s.worst = r.n; s.worstAt = Date.now() - s.at; }
        if (log.length < 30) log.push(s.label + ' +' + (Date.now() - s.at) + 'ms mode=' + nd.mode() + ' bad=' + r.n + ' ' + r.who);
      }
    }
    requestAnimationFrame(tick);
  }

  function centre() {
    var r = dock.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  /* one identical pop, measured from the moment the pointer reaches the dock */
  function pop(flag, label, then) {
    window.__noFlyShape = flag;
    var c = centre();
    nd.cursorFrame(20, 300, false);            /* away first, so both runs start collapsed */
    setTimeout(function () {
      reset(label);
      nd.cursorFrame(c[0], c[1], false);
      setTimeout(function () { nd.cursorFrame(c[0], c[1], true); }, 100);
      setTimeout(function () { report(); then(); }, 1600);
    }, 700);
  }

  setTimeout(function () {
    note('rest ' + nd.region() + ' leaks=' + nd.leaks() + ' cards=' + loose().length);
    requestAnimationFrame(tick);
    pop(true, 'old(pad90)', function () {
      pop(false, 'new(dest-rect)', function () {
        log.forEach(function (l) { note('miss ' + l); });
        note('settled ' + nd.region() + ' leaks=' + nd.leaks());
      });
    });
  }, 1500);
})();
