/* The panel half of the FROST re-shoot: put the window on the view the gallery uses (the
   ledger under 全部任务, not whatever view the last test left it on), and report what the
   page thinks its own size is. The crop is taken from the window rect, not from these
   numbers — the webview is zoomed, so CSS px and device px are not the same box, and
   measuring by the CSS numbers is what cut the previous plates off mid-panel. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function click(text) {
    var b = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
      .filter(function (x) { return (x.textContent || '').indexOf(text) >= 0; })[0];
    if (b) b.click();
    return !!b;
  }
  wait(1200).then(function () {
    note('clicked 全部任务: ' + click('全部任务'));
    return wait(1800);
  }).then(function () {
    var r = document.querySelector('.mod-head, .hud-head');
    note('css=' + innerWidth + 'x' + innerHeight + ' dpr=' + devicePixelRatio +
      ' rows=' + document.querySelectorAll('.ledger-row, .todo-row, .lg-row').length +
      ' style=' + document.documentElement.getAttribute('data-style') +
      ' theme=' + document.documentElement.getAttribute('data-theme') +
      ' head=' + (r ? Math.round(r.getBoundingClientRect().width) + 'x' + Math.round(r.getBoundingClientRect().height) : '-'));
  }).catch(function (e) { note('ERROR ' + (e && e.message)); });
})();
