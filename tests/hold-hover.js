/* Holds the deck in its hovered, spread state so a crop can be taken at leisure.
   Drives the logical pointer, so the real cursor stays wherever the user left it. */
(function () {
  var nd = window.__nd, API = window.API;
  var dock = document.getElementById('dock');
  nd.autoTuck(false);
  nd.tuck(false);
  var n = 0;
  setInterval(function () {
    /* re-read every tick: the deck moves, and a stale centre lands the pointer off it
       so the spread never opens and a capture would show nothing */
    var r = dock.getBoundingClientRect();
    n++;
    nd.cursorCmd(r.left + r.width / 2 + (n % 2 ? 5 : -5), r.top + r.height / 2 + (n % 3 ? 3 : -3), true);
    if (n === 12) {
      var c = document.querySelectorAll('.todo-card:not(.docked)').length;
      API.bootNote('[H] mode=' + nd.hoverInfo().mode + ' loose=' + c + ' ' + nd.region() + ' ALL=' + nd.leaks(1));
    }
  }, 110);
})();
