/* Drives the real editor: opens the task modal from a ledger row, checks the priority
   buttons are actually styled here, that minutes go 00–59, that the lunar yearly
   choice exists and is selectable, and that the title bar moves the panel. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[M] ' + s); } catch (e) { /* no bridge */ } }
  function q(sel) { return document.querySelector(sel); }

  function drag() {
    var head = q('.modal-head');
    var panel = q('.modal-panel');
    if (!head || !panel) return note('FAIL no modal for drag');
    var r = panel.getBoundingClientRect();
    function ptr(type, dx, dy) {
      head.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 9, isPrimary: true,
        button: 0, buttons: 1,
        clientX: r.left + 40 + dx, clientY: r.top + 8 + dy
      }));
    }
    ptr('pointerdown', 0, 0);
    ptr('pointermove', 180, 120);
    var moved = panel.style.transform;
    ptr('pointerup', 180, 120);
    var r2 = panel.getBoundingClientRect();
    note('drag bound=' + (head.dataset.dragBound === '1') + ' transform=' + (moved || 'NONE') +
      ' movedPx=' + Math.round(r2.left - r.left) + ',' + Math.round(r2.top - r.top));
    /* Now slam it past every edge. A webview cannot paint outside its own window, so
       anything hanging off an edge read as "the dialog lost a piece" — the panel has
       to stop at the viewport, not travel through it. */
    ptr('pointerdown', 0, 0);
    ptr('pointermove', 9999, 9999);
    ptr('pointerup', 9999, 9999);
    var rr = q('.modal-panel').getBoundingClientRect();
    note('corner right=' + Math.round(rr.right) + '/' + window.innerWidth +
      ' bottom=' + Math.round(rr.bottom) + '/' + window.innerHeight +
      ' inside=' + (rr.left >= -0.5 && rr.top >= -0.5 &&
        rr.right <= window.innerWidth + 0.5 && rr.bottom <= window.innerHeight + 0.5));
    ptr('pointerdown', 0, 0);
    ptr('pointermove', -9999, -9999);
    ptr('pointerup', -9999, -9999);
    var rl = q('.modal-panel').getBoundingClientRect();
    note('topLeft left=' + Math.round(rl.left) + ' top=' + Math.round(rl.top) +
      ' inside=' + (rl.left >= -0.5 && rl.top >= -0.5));
    head.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    setTimeout(function () {
      note('after-dblclick reset=' + (q('.modal-panel').style.transform || 'clean'));
    }, 120);
  }

  function openTaskModal(tries) {
    var edit = q('[data-act="edit"]');
    if (!edit) {
      if (tries > 20) return note('FAIL no edit button');
      return setTimeout(function () { openTaskModal(tries + 1); }, 200);
    }
    edit.click();
    setTimeout(check, 400);
  }

  function check() {
    var pb = q('.prio-row .pbtn');
    var cs = pb ? getComputedStyle(pb) : null;
    var min = q('[data-plan-input="minute"]');
    var rep = q('[data-plan-input="repeat"]');
    var pop = q('.plan-pop');
    note('pbtn bg=' + (cs ? cs.backgroundColor : '-') + ' border=' + (cs ? cs.borderTopWidth : '-') +
      ' count=' + document.querySelectorAll('.prio-row .pbtn').length);
    note('minutes=' + (min ? min.options.length : '-') +
      ' first=' + (min && min.options[0] ? min.options[0].value : '-') +
      ' last=' + (min && min.options.length ? min.options[min.options.length - 1].value : '-'));
    note('repeat=' + (rep ? Array.prototype.map.call(rep.options, function (o) { return o.textContent; }).join('|') : '-'));
    if (rep) {
      var lun = Array.prototype.find.call(rep.options, function (o) { return o.value === 'lunarYearly'; });
      if (lun) {
        rep.value = 'lunarYearly';
        rep.dispatchEvent(new Event('change', { bubbles: true }));
        setTimeout(function () {
          var again = q('[data-plan-input="repeat"]');
          API.getState().then(function (st) {
            var withLunar = st.todos.filter(function (t) { return t.lunar; });
            note('lunar picked; stored=' + JSON.stringify(withLunar.map(function (t) { return { r: t.repeat, l: t.lunar }; })) +
              ' selectShows=' + (again ? again.options[again.selectedIndex].textContent : '-'));
          });
        }, 400);
      } else {
        note('FAIL no lunarYearly option');
      }
    }
    var dateField = q('[data-plan-field="date"]');
    if (dateField) dateField.click();
    setTimeout(function () {
      var p = q('.plan-pop') || q('.plan-cal');
      var host = p ? p.getBoundingClientRect() : null;
      var panel = q('.modal-panel').getBoundingClientRect();
      note('cal overflowRight=' + (host ? Math.round(host.right - panel.right) : '-') +
        ' headWraps=' + (q('.cal-head') ? getComputedStyle(q('.cal-head')).flexWrap : '-'));
      drag();
    }, 300);
  }

  var nav = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
    .filter(function (x) { return x.textContent.indexOf('全部任务') >= 0; })[0];
  if (nav) nav.click();
  setTimeout(function () { openTaskModal(0); }, 600);
})();
