/* Two faithful checks:
   1. the collapse fade — cards are still painted while already classed docked, which
      is the window the region used to cut them through;
   2. the month double-click, delivered the way a browser really delivers it: the day
      cell is rebuilt by the click that selects it, so dblclick arrives on the panel,
      not on the cell. */
(function () {
  var nd = window.__nd, API = window.API;
  function note(s) { try { API.bootNote('[F] ' + s); } catch (e) { /* no bridge */ } }
  var dock = document.getElementById('dock');
  var r = dock.getBoundingClientRect();
  var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  nd.autoTuck(false);
  nd.tuck(false);
  var n = 0;
  var iv = setInterval(function () {
    n++;
    nd.cursorCmd(cx + (n % 2 ? 4 : -4), cy, true);
    if (n > 10) clearInterval(iv);
  }, 90);
  function cards() {
    return Array.prototype.map.call(document.querySelectorAll('.todo-card'), function (c) {
      var b = c.getBoundingClientRect();
      var cs = getComputedStyle(c);
      return c.className.replace('todo-card ', '') +
        ' op=' + cs.opacity + ' vis=' + cs.visibility +
        ' @' + Math.round(b.left) + ',' + Math.round(b.top) + ' ' +
        Math.round(b.width) + 'x' + Math.round(b.height) +
        ' mid=' + (nd.swallowsAt(b.left + b.width / 2, b.top + b.height / 2) ? 'ours' : 'THROUGH');
    }).join(' ;; ');
  }
  setTimeout(function () {
    note('spread ' + nd.region() + ' ALL=' + nd.leaks(1));
    nd.tuck(true);
    setTimeout(function () { note('fade-120 ' + nd.region() + ' ALL=' + nd.leaks(1) + ' CARDS=' + cards()); }, 120);
    setTimeout(function () { note('fade-260 ' + nd.region() + ' ALL=' + nd.leaks(1) + ' CARDS=' + cards()); }, 260);
    setTimeout(function () { note('after ' + nd.region() + ' ALL=' + nd.leaks(1) + ' CARDS=' + cards()); }, 1600);
  }, 1400);
})();
