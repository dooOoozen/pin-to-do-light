/* Asserts the dashboard changes from inside the panel: nav order, the entry form and
   search being gone in the reading views, the retired heat switch, the timeline's
   numbering, the ledger hover colour, and the month cell double-click. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[V] ' + s); } catch (e) { /* no bridge */ } }
  var navs = function () { return Array.prototype.slice.call(document.querySelectorAll('#navFilters button')); };
  var label = function (b) { return (b.textContent || '').replace(/[0-9]+$/, ''); };
  function vis(sel) {
    var n = document.querySelector(sel);
    if (!n) return 'missing';
    return getComputedStyle(n).display === 'none' ? 'hidden' : 'SHOWN';
  }
  function clickView(text) {
    var b = navs().filter(function (x) { return x.textContent.indexOf(text) >= 0; })[0];
    if (!b) { note('FAIL no nav "' + text + '"'); return false; }
    b.click();
    return true;
  }
  function ruleBg(sel) {
    for (var s = 0; s < document.styleSheets.length; s++) {
      var rules;
      try { rules = document.styleSheets[s].cssRules; } catch (e) { continue; }
      for (var i = 0; rules && i < rules.length; i++) {
        if (rules[i].selectorText === sel) {
          return rules[i].style.background || rules[i].style.backgroundColor || 'empty';
        }
      }
    }
    return 'not-found';
  }

  note('nav=' + navs().map(label).join(','));
  note('heatSwitch=' + (document.getElementById('heatSwitch') ? 'STILL PRESENT' : 'gone') +
    ' taskHover=' + ruleBg('.task:hover'));

  clickView('时间线');
  setTimeout(function () {
    var idx = document.querySelector('.tl .row-idx');
    note('timeline form=' + vis('#pageTasks .composer') + ' toolbar=' + vis('#pageTasks .toolbar') +
      ' panel=' + vis('#viewPanel') +
      ' idx=' + (idx ? getComputedStyle(idx).display : 'no-idx-nodes'));
    clickView('月历');
    setTimeout(function () {
      var cells = document.querySelectorAll('.cal-cell');
      note('month form=' + vis('#pageTasks .composer') + ' toolbar=' + vis('#pageTasks .toolbar') +
        ' cells=' + cells.length);
      var cell = document.querySelector('.cal-cell:not(.out)');
      if (!cell) { note('FAIL no in-month cell'); return; }
      var want = cell.getAttribute('data-day');
      cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      setTimeout(function () {
        var host = document.querySelector('#mPlanHost');
        note('dblclick day=' + want + ' modal=' +
          (document.querySelector('#modalRoot').children.length ? 'OPEN' : 'EMPTY') +
          ' plan=' + (host ? host.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) : 'no-host'));
      }, 400);
    }, 500);
  }, 500);
})();
