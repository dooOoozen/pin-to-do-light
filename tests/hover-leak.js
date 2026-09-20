/* Asks the region which parts of the deck it is clipping away, at rest and while
   hovered — hovering fans the sheets out beyond the dock's own layout box, which is
   where a partly see-through card comes from. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote(s); } catch (e) { /* no bridge */ } }
  var dock = document.getElementById('dock');
  nd.autoTuck(false);
  nd.tuck(false);
  var r = dock.getBoundingClientRect();
  var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  function say(tag) {
    note('[L] ' + tag + ' mode=' + nd.hoverInfo().mode + ' ' + nd.region() +
      ' scoped=' + nd.leaks() + ' ALL=' + nd.leaks(1));
  }
  say('rest');
  var n = 0;
  var iv = setInterval(function () {
    n++;
    nd.cursorCmd(cx + (n % 2 ? 4 : -4), cy, true);
    if (n === 8) { say('hovering'); clearInterval(iv); }
    if (n > 40) clearInterval(iv);
  }, 90);
  setTimeout(function () { say('settled'); }, 3400);
})();
