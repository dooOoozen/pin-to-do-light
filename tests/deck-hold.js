/* Keeps the deck open for as long as the screenshotter needs, by feeding the same
   pointer position the host feed would send while the cursor rests on the dock. */
(function () {
  var nd = window.__nd;
  var dock = document.getElementById('dock');
  nd.autoTuck(false);
  var n = 0;
  setInterval(function () {
    var r = dock.getBoundingClientRect();
    n++;
    nd.cursorFrame(r.left + r.width / 2 + (n % 2 ? 4 : -4), r.top + r.height / 2, true);
  }, 180);
})();
