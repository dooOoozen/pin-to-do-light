/* Two clicks on a day cell and nothing else: no dblclick is dispatched, because the
   whole point is that the gesture cannot be relied on once the first click rebuilds
   the grid. If the modal opens from clicks alone, the feature works under a real
   mouse. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[C] ' + s); } catch (e) { /* no bridge */ } }
  var b = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
    .filter(function (x) { return x.textContent.indexOf('月历') >= 0; })[0];
  if (!b) { note('FAIL no month nav'); return; }
  b.click();
  setTimeout(function () {
    var cell = document.querySelector('.cal-cell:not(.out)');
    if (!cell) { note('FAIL no cell'); return; }
    var want = cell.getAttribute('data-day');
    function click(node) {
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
    click(cell);
    var again = document.querySelector('.cal-cell[data-day="' + want + '"]');
    note('first click, rebuilt=' + (again && again !== cell ? 'yes' : 'same'));
    click(again || cell);
    setTimeout(function () {
      var host = document.querySelector('#mPlanHost');
      note('day=' + want + ' dblclickDispatched=NEVER modal=' +
        (document.querySelector('#modalRoot').children.length ? 'OPEN' : 'NOT-OPEN') +
        ' plan=' + (host ? host.textContent.replace(/\s+/g, ' ').trim().slice(0, 20) : '-'));
    }, 350);
  }, 600);
})();
