/* Read-only: what every picker in the colour lab shows as its starting value. The
   derived plates are color-mix() in the stylesheet, so a naive getComputedStyle of the
   custom property hands the picker the function text and it renders as black. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[L] ' + s); } catch (e) { /* no bridge */ } }
  /* the day plates only exist in a grouped ledger view */
  Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
    .filter(function (x) { return x.textContent.indexOf('全部任务') >= 0; })[0].click();
  setTimeout(function () { document.getElementById('btnSettings').click(); }, 600);
  setTimeout(function () {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#palRows .pal-row'));
    var bad = [];
    var out = rows.map(function (r) {
      var v = r.querySelector('input[type=color]').value;
      var n = r.querySelector('.pal-name').textContent;
      if (v === '#000000') bad.push(n);
      return n + '=' + v;
    });
    note('rows=' + rows.length + ' black=' + (bad.length ? bad.join(',') : 'none'));
    note(out.join(' '));
    /* the plate the day headers actually paint, resolved the same way the picker does */
    var head = document.querySelector('.day-head');
    note('dayHeadBg=' + (head ? getComputedStyle(head).backgroundColor : '-') +
      ' today=' + (document.querySelector('.day-head.today') ?
        getComputedStyle(document.querySelector('.day-head.today')).backgroundColor : '-') +
      ' overdue=' + (document.querySelector('.day-head.overdue') ?
        getComputedStyle(document.querySelector('.day-head.overdue')).backgroundColor : '-'));
  }, 900);
})();
