/* Why does #modStats measure 0x0 from a panel script? Print what the panel actually thinks
   it is showing: the nav buttons and which one is active, the grid box, the module box, and
   every ancestor between them that has taken itself out of the layout. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[V] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function box(n) {
    var r = n.getBoundingClientRect(), cs = getComputedStyle(n);
    return Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top) +
      ' display=' + cs.display + ' vis=' + cs.visibility + ' op=' + cs.opacity;
  }
  Promise.resolve(API.getState()).then(function () { return wait(600); }).then(function () {
    note('title=' + document.title + ' hidden=' + document.hidden + ' body=' + box(document.body));
    note('nav buttons: ' + Array.prototype.map.call(document.querySelectorAll('#navFilters button'),
      function (b) { return (b.textContent || '').trim().replace(/\s+/g, '') + (b.classList.contains('on') ? '*' : ''); }).join(' '));
    var g = document.getElementById('dashGrid');
    var m = document.getElementById('modStats');
    note('grid ' + (g ? box(g) : 'missing'));
    note('stats ' + (m ? box(m) : 'missing'));
    var chain = [], n = m;
    while (n && n !== document.body) { chain.push(n.tagName + '.' + (n.className || '').split(' ')[0] + ' ' + box(n)); n = n.parentElement; }
    chain.forEach(function (line, i) { note('  ancestor ' + i + ' ' + line); });
    var dash = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
      .filter(function (x) { return (x.textContent || '').indexOf('仪表盘') >= 0; })[0];
    note('clicking 仪表盘: ' + !!dash);
    if (dash) dash.click();
    return wait(1500);
  }).then(function () {
    var g = document.getElementById('dashGrid'), m = document.getElementById('modStats');
    note('after click grid ' + (g ? box(g) : '-') + ' stats ' + (m ? box(m) : '-'));
    note('tiles=' + document.querySelectorAll('#modStats .pd-stats .stat').length +
      ' first=' + (function () {
        var t = document.querySelector('#modStats .pd-stats .stat');
        return t ? box(t) : '-';
      })());
  }).catch(function (e) { note('ERROR ' + (e && e.message)); });
})();
