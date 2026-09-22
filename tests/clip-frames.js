/* The clipped corner has survived two fixes because it lasts a frame or three, and every
   probe so far sampled a few times a second — which is how "claimed=16/16, leaks=tight"
   could be reported while the user was watching a notch. This samples once per animation
   frame for as long as it runs, comparing each painting card's four corners against the
   spans that were actually handed to SetWindowRgn, and logs only the frames where the
   painted card is outside them. A real cursor drives the hover from outside the page
   (tools/grab-frames.ps1), because CSS :hover is the thing that grows the card and no
   synthetic event can cause it. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[F] ' + s); } catch (e) { /* no bridge */ } }

  function cards() {
    return Array.prototype.slice.call(document.querySelectorAll('.todo-card')).filter(function (c) {
      if (!c.offsetWidth || !c.offsetHeight) return false;
      var cs = getComputedStyle(c);
      if (cs.opacity === '0' || cs.visibility === 'hidden') return false;
      var b = c.getBoundingClientRect();
      return b.right > 0 && b.left < window.innerWidth && b.bottom > 0 && b.top < window.innerHeight;
    });
  }

  var t0 = Date.now(), frames = 0, worst = 0, worstAt = 0, hits = 0, log = [];
  function tick() {
    frames++;
    var spans = nd.pushed();
    if (spans) {
      var bad = 0, who = '';
      cards().forEach(function (c, i) {
        var b = c.getBoundingClientRect();
        var pts = [[b.left, b.top], [b.right - 0.5, b.top],
                   [b.left, b.bottom - 0.5], [b.right - 0.5, b.bottom - 0.5]];
        pts.forEach(function (p) {
          var hit = spans.some(function (r) {
            return p[0] >= r.x && p[0] < r.x + r.width && p[1] >= r.y && p[1] < r.y + r.height;
          });
          if (!hit) { bad++; if (!who) who = 'card' + i + '@' + Math.round(p[0]) + ',' + Math.round(p[1]); }
        });
      });
      if (bad) {
        hits++;
        if (bad > worst) { worst = bad; worstAt = Date.now() - t0; }
        if (log.length < 40) {
          log.push('+' + (Date.now() - t0) + 'ms mode=' + nd.mode() + ' bad=' + bad + ' ' + who);
        }
      }
    }
    if (frames % 60 === 0) {
      note('beat frames=' + frames + ' missFrames=' + hits + ' worst=' + worst +
        '@' + worstAt + 'ms painting=' + cards().length + ' lag=' + nd.lag());
    }
    if (Date.now() - t0 < 60000) requestAnimationFrame(tick);
    else {
      note('DONE frames=' + frames + ' missFrames=' + hits + ' worst=' + worst + '@' + worstAt);
      log.forEach(function (l) { note('miss ' + l); });
    }
  }
  requestAnimationFrame(tick);
})();
