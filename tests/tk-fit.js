/* The axis is supposed to be: columns on the left, ring + figures + recent on the
   right. On screen the side column is pushed out past the panel's own edge, so the
   grid is resolving wider than its container. Measure every box in the chain instead
   of guessing which one is at fault. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[K] ' + s); } catch (e) { /* no bridge */ } }
  function q(s) { return document.querySelector(s); }
  function w(n, tag) {
    if (!n) return note('  ' + tag + ' ABSENT');
    var r = n.getBoundingClientRect();
    var cs = getComputedStyle(n);
    note('  ' + tag + ' box=' + Math.round(r.width) + 'x' + Math.round(r.height) +
      ' L=' + Math.round(r.left) + ' R=' + Math.round(r.right) +
      ' client=' + n.clientWidth + ' scroll=' + n.scrollWidth +
      ' disp=' + cs.display + ' minW=' + cs.minWidth + ' tpl=' + (cs.gridTemplateColumns || '').slice(0, 60));
  }
  var nav = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
    .filter(function (x) { return x.textContent.indexOf('时间轴') >= 0; })[0];
  if (!nav) { note('FAIL no nav'); return; }
  nav.click();
  setTimeout(function () {
    note('chain main>viewPanel>tkx');
    w(q('.main'), '.main');
    w(q('#viewPanel'), '#viewPanel');
    w(q('.tkx'), '.tkx');
    w(q('.tk-cols'), '.tk-cols');
    w(q('.tk-side'), '.tk-side');
    w(q('.tk-body'), '.tk-body');
    w(q('.tk-grid'), '.tk-grid');
    w(q('.tk-head'), '.tk-head');
    w(q('.tk-caps'), '.tk-caps');
    w(q('.tk-nav'), '.tk-nav');
    w(q('.tk-now'), '.tk-now');
    note('panel window=' + window.innerWidth + 'x' + window.innerHeight +
      ' docScrollW=' + document.documentElement.scrollWidth);
  }, 1000);
})();
