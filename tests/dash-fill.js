/* The grid has to fill a tall window: measure the dead band under the last row before
   and after the harness resizes the panel window from outside. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[F] ' + s); } catch (e) { /* no bridge */ } }
  function qa(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function nav(t) {
    return qa('#navFilters button').filter(function (x) { return x.textContent.indexOf(t) >= 0; })[0];
  }
  function report(tag) {
    var m = document.querySelector('.main');
    var main = m.getBoundingClientRect();
    var grid = document.querySelector('#dashGrid').getBoundingClientRect();
    var lowest = 0, hs = [];
    qa('#dashGrid .mod').forEach(function (mod) {
      var r = mod.getBoundingClientRect();
      if (r.bottom > lowest) lowest = r.bottom;
      hs.push(mod.dataset.mod + ':' + Math.round(r.height));
    });
    note(tag + ' inner=' + Math.round(window.innerWidth) + 'x' + Math.round(window.innerHeight) +
      ' dpr=' + window.devicePixelRatio + ' main=' + Math.round(main.width) + 'x' + Math.round(main.height) +
      ' grid=' + Math.round(grid.width) + 'x' + Math.round(grid.height) +
      ' deadBottom=' + Math.round(main.bottom - lowest) +
      ' scrolls=' + (m.scrollHeight > m.clientHeight + 2) +
      ' mods=' + hs.join(','));
  }

  nav('仪表盘').click();
  setTimeout(function () { report('before'); }, 1500);
  /* the window is resized from outside while this is waiting */
  setTimeout(function () { report('after '); }, 8000);
  setTimeout(function () { report('late  '); }, 13000);
})();
