/* The grown edge has to be inside the region even when nothing has told the layer which
   card the browser is hovering — that is the clipped chip. Each card's four "where the
   lifted box would be" points are asked of the region itself, and the state is logged on a
   slow cadence so the fullscreen probe can read what the deck did when a film ended. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[N] ' + s); } catch (e) { /* no bridge */ } }
  var dock = document.getElementById('dock');
  var n = 0, measured = false;

  setInterval(function () {
    var r = dock.getBoundingClientRect();
    n++;
    nd.cursorFrame(r.left + r.width / 2 + (n % 2 ? 4 : -4), r.top + r.height / 2, true);
    if (n === 16 && !measured) { measured = true; measure(); }
    if (n % 12 === 0) {
      note('state mode=' + nd.mode() + ' tucked=' + nd.hoverInfo().tucked +
        ' cards=' + loose().length + ' spans=' + (nd.shape() || []).length +
        ' region=' + nd.region() + ' leaks=' + nd.leaks(false));
    }
  }, 180);

  function loose() {
    return Array.prototype.slice.call(document.querySelectorAll('.todo-card'))
      .filter(function (c) { return !c.classList.contains('docked') && c.offsetWidth; });
  }

  function measure() {
    var cards = loose();
    var miss = 0, checked = 0;
    cards.forEach(function (c, i) {
      var b = c.getBoundingClientRect();
      var gx = b.width * 0.045, gy = b.height * 0.045;
      var pts = [[b.left - gx, b.top - gy], [b.right + gx, b.top - gy],
                 [b.left - gx, b.bottom + gy], [b.right + gx, b.bottom + gy]];
      pts.forEach(function (p) {
        checked++;
        if (!nd.swallowsAt(p[0], p[1])) miss++;
      });
      note('card' + i + ' box=' + Math.round(b.width) + 'x' + Math.round(b.height) +
        ' grown=' + Math.round(b.width * 1.09) + 'x' + Math.round(b.height * 1.09) +
        ' edges=' + pts.map(function (p) { return nd.swallowsAt(p[0], p[1]) ? '1' : '0'; }).join(''));
    });
    note('grown edges claimed=' + (checked - miss) + '/' + checked + ' hovered=' +
      (document.querySelector('.todo-card:hover') ? 'yes' : 'no'));
  }
})();
