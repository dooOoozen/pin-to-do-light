/* Holds the widest chip in its hovered box and leaves it there, so an outside-in
   probe can answer what nothing inside the page can: does the OS still deliver
   pixels and clicks at the card's own outer edge.

   Every earlier hover probe drove the logical pointer, so CSS :hover never applied
   and the card never grew — the state being reported as broken was never measured.
   --sc is the variable the resting transform already reads, and the hover rule
   replaces it with scale(1.09), so setting it gives exactly the hovered box.

   The page logs the boxes in CSS px; the layer's own screen origin comes from the
   "layer=" field on the periodic log line. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[H] ' + s); } catch (e) { /* no bridge */ } }
  var dock = document.getElementById('dock');

  function widest() {
    var best = null, bw = 0;
    Array.prototype.forEach.call(document.querySelectorAll('.todo-card:not(.docked)'), function (c) {
      var w = c.getBoundingClientRect().width;
      if (w > bw) { bw = w; best = c; }
    });
    return best;
  }

  function box(c) {
    var b = c.getBoundingClientRect();
    return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)];
  }

  nd.autoTuck(false);
  nd.tuck(false);
  var n = 0, logged = false, card = null, rest = null;
  setInterval(function () {
    var r = dock.getBoundingClientRect();
    n++;
    nd.cursorCmd(r.left + r.width / 2 + (n % 2 ? 5 : -5), r.top + r.height / 2, true);
    if (n === 10 && !card) {
      card = widest();
      if (!card) return note('FAIL no loose card');
      rest = box(card);
      var t = card.querySelector('.card-title');
      note('card "' + (t.textContent || '').slice(0, 8) + '" rest=' + rest.join(','));
      card.style.setProperty('--sc', '1.09');
    }
    if (n === 14 && !logged) {
      logged = true;
      note('grown=' + box(card).join(',') + ' ' + nd.region() +
        ' pushed=' + nd.lag() + ' ALL=' + nd.leaks(1));
      note('layer rect for screen offset is on the periodic line');
    }
  }, 110);
})();
