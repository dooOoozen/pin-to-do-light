/* Reports the deck state on a slow timer and touches nothing else — the point is to
   watch what the deck does while a fullscreen window appears and then goes away. A test
   that held the deck open could not tell a wake from a non-wake. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[F] ' + s); } catch (e) { /* no bridge */ } }
  var t0 = Date.now();
  setInterval(function () {
    var h = nd.hoverInfo();
    note('+' + Math.round((Date.now() - t0) / 100) / 10 + 's mode=' + nd.mode() +
      ' tucked=' + h.tucked + ' cards=' +
      document.querySelectorAll('.todo-card:not(.docked)').length);
  }, 900);
})();
