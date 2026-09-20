/* The axis in the light theme, then the theme put back. The restore has to run
   before the process is stopped: the toggle writes through to settings, so killing
   the instance first would leave the user's board in the theme the screenshot wanted. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function q(s) { return document.querySelector(s); }
  function nav(t) {
    return Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
      .filter(function (x) { return x.textContent.indexOf(t) >= 0; })[0];
  }
  q('#btnTheme').click();
  setTimeout(function () {
    nav('时间轴').click();
    setTimeout(function () {
      note('paper theme=' + document.documentElement.dataset.theme +
        ' cols=' + document.querySelectorAll('.tk-col').length +
        ' caps=' + document.querySelectorAll('.tk-cap').length +
        ' blocks=' + document.querySelectorAll('.tk-blk').length +
        ' ring=' + (q('.tk-ring') ? Math.round(q('.tk-ring').getBoundingClientRect().width) : '-'));
    }, 900);
  }, 700);
  setTimeout(function () {
    q('#btnTheme').click();
    setTimeout(function () {
      note('restored theme=' + document.documentElement.dataset.theme);
    }, 800);
  }, 14000);
})();
