/* Toggles the palette from the footer button and reports what the two windows end up
   painted with, plus the shadow the lifted panels are supposed to carry. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[H] ' + s); } catch (e) { /* no bridge */ } }
  function snap(tag) {
    var rs = getComputedStyle(document.documentElement);
    var b = getComputedStyle(document.body);
    note(tag + ' theme=' + document.documentElement.dataset.theme +
      ' bodyBg=' + b.backgroundColor + ' bodyColor=' + b.color +
      ' paper=' + rs.getPropertyValue('--paper').trim() +
      ' ink=' + rs.getPropertyValue('--ink').trim() +
      ' brick=' + rs.getPropertyValue('--brick').trim());
  }
  snap('start');
  document.getElementById('btnTheme').click();
  setTimeout(function () {
    snap('toggled');
    document.getElementById('btnSettings').click();
    setTimeout(function () {
      var p = document.querySelector('.modal-panel');
      note('modal ' + (p ? getComputedStyle(p).boxShadow : 'ABSENT'));
      var t = document.getElementById('btnTheme');
      note('button label=' + (t ? t.textContent : '-') + ' primary=' + (t ? t.classList.contains('primary') : '-'));
      document.getElementById('btnTheme').click();
      setTimeout(function () { snap('back-to-day'); }, 600);
    }, 500);
  }, 700);
})();
