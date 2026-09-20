/* Outside-in region audit: every card that paints, and eight points just inside its own
   edges, converted to SCREEN pixels. An outside probe asks WindowFromPoint at each one —
   if the layer owns the point the region covers it, if something behind does then the
   region has cut that part of the card away, which is the "缺块" the page cannot see. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[A] ' + s); } catch (e) { /* no bridge */ } }

  setTimeout(function () {
    nd.autoTuck(false);
    /* the pop is driven by the same command the host feed sends, so the tucked
       approach rule itself decides to open the deck */
    nd.tuck(true);
    var dock = document.getElementById('dock');
    var n = 0;
    var iv = setInterval(function () {
      var r = dock.getBoundingClientRect();
      var x = r.left + r.width / 2 + (n % 2 ? 5 : -5), y = r.top + r.height / 2;
      n++;
      /* the first frames cross the tucked dock and pop it; the rest keep the pointer on
         it, or the deck flies home again before anything can be measured */
      nd.cursorFrame(x, y, n > 8);
      if (n < 34) return;
      clearInterval(iv);
      measure();
    }, 110);
  }, 900);

  function state() {
    return 'mode=' + nd.mode() + ' info=' + JSON.stringify(nd.hoverInfo());
  }

  function measure() {
    API.feedStats().then(function (f) {
        var ox = f.layer.x, oy = f.layer.y, k = f.scale || 1;
        var cards = Array.prototype.slice.call(document.querySelectorAll('.todo-card'))
          .filter(function (c) { return !c.classList.contains('docked') && c.offsetWidth; });
        var pts = [];
        cards.forEach(function (c, i) {
          var r = c.getBoundingClientRect();
          var inset = 3;
          var xs = [r.left + inset, r.right - inset, (r.left + r.right) / 2, (r.left + r.right) / 2];
          var ys = [r.top + inset, r.bottom - inset, r.top + inset, r.bottom - inset];
          var tags = ['tl', 'br', 'tr', 'bl'];
          for (var j = 0; j < 4; j++) {
            pts.push(Math.round(ox + xs[j] * k) + ',' + Math.round(oy + ys[j] * k) + ',' + i + tags[j]);
          }
          note('card' + i + ' css=' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' +
            Math.round(r.width) + 'x' + Math.round(r.height) +
            ' rot=' + (c.style.getPropertyValue('--rot') || '-') +
            ' sc=' + (c.style.getPropertyValue('--sc') || '-'));
        });
        note('layer=' + ox + ',' + oy + ' scale=' + k + ' cards=' + cards.length +
          ' ' + state() + ' all=' + document.querySelectorAll('.todo-card').length +
          ' spans=' + (nd.shape() || []).length + ' region=' + nd.region() + ' leaks=' + nd.leaks(false));
        note('PTS ' + pts.join(';'));
    });
  }
})();
