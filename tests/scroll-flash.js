/* The scrollbar flash is a width reflow plus a stale scroll offset, so measure both
   across the exact round trip that showed it: dashboard -> a long page, scrolled to
   the bottom -> back to the dashboard. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[S] ' + s); } catch (e) { /* no bridge */ } }
  var m = document.querySelector('.main');
  if (!m) { note('FAIL no .main'); return; }
  function snap(tag) {
    var kids = Array.prototype.map.call(m.children, function (c) {
      return (c.id || c.className) + ':' + Math.round(c.getBoundingClientRect().height);
    }).join(' ');
    note(tag + ' clientW=' + m.clientWidth + ' scrollTop=' + m.scrollTop +
      ' sh=' + m.scrollHeight + '/ch=' + m.clientHeight +
      ' scrolls=' + (m.scrollHeight > m.clientHeight ? 'yes' : 'no') + ' [' + kids + ']');
  }
  function pick(text) {
    var b = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
      .filter(function (x) { return x.textContent.indexOf(text) >= 0; })[0];
    if (b) b.click(); else note('FAIL no nav ' + text);
  }
  snap('dash');
  pick('全部任务');
  setTimeout(function () {
    snap('tasks');
    m.scrollTop = m.scrollHeight;
    snap('tasks-scrolled');
    pick('仪表盘');
    snap('back-to-dash');
    setTimeout(function () { snap('settled'); }, 300);
  }, 300);
})();
