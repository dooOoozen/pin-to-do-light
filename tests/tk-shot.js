/* Holds the vertical axis on screen so a crop can be taken, then flips the theme and
   flips it back: the user's own choice is what must be on screen when this ends, not
   whatever the screenshot needed. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[K] ' + s); } catch (e) { /* no bridge */ } }
  function q(s) { return document.querySelector(s); }
  function nav(t) {
    return Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
      .filter(function (x) { return x.textContent.indexOf(t) >= 0; })[0];
  }
  var b = nav('时间轴');
  if (!b) { note('FAIL no 时间轴'); return; }
  b.click();
  setTimeout(function () {
    var body = q('.tk-body');
    note('week cols=' + document.querySelectorAll('.tk-col').length +
      ' blocks=' + document.querySelectorAll('.tk-blk').length +
      ' scrollTop=' + (body ? body.scrollTop : '-') +
      ' nowTop=' + ((q('#tkNowline') || { style: {} }).style ? q('#tkNowline').style.top : '-') +
      ' ring=' + (q('.tk-ring') ? 'yes' : 'no') + ' theme=' + document.documentElement.dataset.theme);
  }, 900);
  setTimeout(function () {
    var d = nav('日');
    if (d) d.click();
    setTimeout(function () {
      note('day cols=' + document.querySelectorAll('.tk-col').length +
        ' blocks=' + document.querySelectorAll('.tk-blk').length);
      var w = q('[data-tk="week"]');
      if (w) w.click();
    }, 500);
  }, 4200);
  setTimeout(function () { q('#btnTheme').click(); }, 9000);
  setTimeout(function () {
    note('paper theme on screen');
  }, 10200);
  setTimeout(function () { q('#btnTheme').click(); }, 20000);
  setTimeout(function () {
    note('restored theme=' + document.documentElement.dataset.theme);
  }, 21200);
})();
