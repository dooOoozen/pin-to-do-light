/* The date popover inside the edit dialog, measured against the dialog that owns it. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[Q] ' + s); } catch (e) { /* no bridge */ } }
  function q(s) { return document.querySelector(s); }
  function nav(t) {
    return Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
      .filter(function (x) { return x.textContent.indexOf(t) >= 0; })[0];
  }
  nav('全部任务').click();
  setTimeout(function () {
    var edit = q('#list .task [data-act="edit"]');
    if (!edit) { note('FAIL no edit button'); return; }
    edit.click();
    setTimeout(function () {
      var panel = q('.modal-panel');
      var pr = panel.getBoundingClientRect();
      note('modal ' + Math.round(pr.width) + 'x' + Math.round(pr.height) +
        ' grip=' + !!q('.modal-grip') + ' bodyScroll=' + !!q('.modal-body'));
      /* the dialog's date control is an inline month grid (.plan-cal behind a
         .plan-field button), not the composer's .plan-pop popover */
      var btn = q('.modal-panel [data-plan-field="date"]');
      if (!btn) { note('FAIL no date field in the editor'); return; }
      btn.click();
      setTimeout(function () {
        var pop = q('.modal-panel .plan-cal');
        if (!pop || pop.classList.contains('u-hidden')) { note('FAIL calendar did not open'); return; }
        var r = pop.getBoundingClientRect();
        note('calendar ' + Math.round(r.width) + 'x' + Math.round(r.height) +
          ' cells=' + pop.querySelectorAll('.cal-day').length +
          ' cellH=' + Math.round(pop.querySelector('.cal-day').getBoundingClientRect().height) +
          ' ofModal=' + Math.round(pr.height) +
          ' insideModalWidth=' + (r.right <= pr.right + 1));
        panel.style.width = '380px';
        panel.style.height = '360px';
        setTimeout(function () {
          var pr2 = panel.getBoundingClientRect();
          var r2 = pop.getBoundingClientRect();
          note('after-resize modal=' + Math.round(pr2.width) + 'x' + Math.round(pr2.height) +
            ' cal=' + Math.round(r2.width) + 'x' + Math.round(r2.height) +
            ' fitsWidth=' + (r2.width <= pr2.width));
          var close = q('.modal-panel [data-act="close"]') || q('.modal-panel .icon-btn');
          if (close) close.click();
        }, 300);
      }, 500);
    }, 700);
  }, 800);
})();
