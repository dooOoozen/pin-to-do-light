/* Walks the panel and announces each stop in the boot log, so the screenshot harness
   can capture on the marker instead of guessing at wall-clock timings — the panel
   takes a variable moment to open, and a fixed sleep produced the same screen twice. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[O] ' + s); } catch (e) { /* no bridge */ } }
  function q(s) { return document.querySelector(s); }
  function nav(t) {
    return Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
      .filter(function (x) { return x.textContent.indexOf(t) >= 0; })[0];
  }
  function go(t, tag, then) {
    var b = nav(t);
    if (!b) { note('MISSING ' + t); if (then) then(); return; }
    b.click();
    /* announce on the way in, not on the way out: the marker means "this screen is up
       now, and it stays up for the dwell", so a harness that captures on it gets the
       screen it is named after */
    note('at ' + tag);
    setTimeout(function () { if (then) then(); }, 3500);
  }

  go('仪表盘', 'dash', function () {
    go('全部任务', 'ledger', function () {
      go('时间轴', 'track', function () {
        q('#btnSettings').click();
        setTimeout(function () {
          var p = q('.modal-panel');
          if (p) { p.style.width = '430px'; p.style.height = '430px'; }
          note('at settings box=' + (p ? Math.round(p.getBoundingClientRect().width) + 'x' +
            Math.round(p.getBoundingClientRect().height) : '-') +
            ' grip=' + document.querySelectorAll('.modal-grip').length);
        }, 1200);
      });
    });
  });
})();
