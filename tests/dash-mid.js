/* Verifies the assembled dashboard: seven modules that can be dragged into a new
   order and resized across the grid, the memo letter that unfolds without moving its
   neighbours, the slider that cannot spill its frame, and the one-line task row. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[D] ' + s); } catch (e) { /* no bridge */ } }
  function q(s) { return document.querySelector(s); }
  function n(s) { return document.querySelectorAll(s).length; }
  function nav(t) {
    return Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
      .filter(function (x) { return x.textContent.indexOf(t) >= 0; })[0];
  }
  function colour(el) { return el ? getComputedStyle(el).color : '-'; }
  function box(el) { var r = el.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }
  function order() {
    return Array.prototype.slice.call(document.querySelectorAll('#dashGrid .mod'))
      .map(function (m) { return m.dataset.mod + ':' + (parseInt((m.style.gridColumn || '').replace(/\D/g, ''), 10) || '?'); });
  }

  var cm = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 400, clientY: 300 });
  document.body.dispatchEvent(cm);
  note('contextmenu prevented=' + cm.defaultPrevented);

  nav('仪表盘').click();
  setTimeout(function () {
    note('modules=' + n('#dashGrid .mod') + ' order=' + order().join(',') +
      ' pomoFace=' + !!q('.pomo-face') + ' slider=' + !!q('#pomoLen[type="range"]') +
      ' time=' + (q('#pomoTime') || { textContent: '-' }).textContent +
      ' ring=' + !!q('.today-band') + ' memoRows=' + n('.memo-row') +
      ' miniRows=' + n('.mini-row') + ' miniTimer=' + n('.mini-timer'));
    var pomo = q('#modPomo');
    var pr = pomo.getBoundingClientRect();
    var grid = q('#dashGrid').getBoundingClientRect();
    note('pomo ' + Math.round(pr.width) + 'x' + Math.round(pr.height) +
      ' insideGrid=' + (pr.right <= grid.right + 1 && pr.left >= grid.left - 1) +
      ' sliderRight=' + Math.round(q('#pomoLen').getBoundingClientRect().right) +
      ' bodyRight=' + Math.round(pr.right) +
      ' spills=' + (q('#pomoLen').getBoundingClientRect().right > pr.right + 1));
    memoStill();
  }, 1200);

  /* the memo letter must unfold inside its own module */
  function memoStill() {
    var mod = q('#modMemo');
    var before = box(mod);
    var gridBefore = box(q('#dashGrid'));
    var boxEl = q('#memoInput');
    var restH = Math.round(boxEl.getBoundingClientRect().height);
    boxEl.focus();
    setTimeout(function () {
      var grownH = Math.round(boxEl.getBoundingClientRect().height);
      note('memo module ' + before + '->' + box(mod) + ' unchanged=' + (before === box(mod)) +
        ' grid ' + gridBefore + '->' + box(q('#dashGrid')) +
        ' input ' + restH + '->' + grownH + ' overlays=' + (grownH > restH + 40));
      boxEl.blur();
      spans();
    }, 500);
  }

  function spans() {
    var b = q('#modMemo .mod-span');
    var seen = [];
    (function step(i) {
      if (i > 4) {
        note('spans cycled=' + seen.join(','));
        API.getState().then(function (st) {
          var dl = st.settings.dashLayout || {};
          note('saved span memo=' + ((dl.span || {}).memo) + ' order=' + (dl.order || []).join(','));
          drag();
        });
        return;
      }
      seen.push(b.textContent);
      b.click();
      setTimeout(function () { step(i + 1); }, 260);
    })(0);
  }

  function drag() {
    var mods = Array.prototype.slice.call(document.querySelectorAll('#dashGrid .mod'));
    var src = mods[0], dst = mods[2];
    var was = order().join(',');
    var dt = null;
    try { dt = new DataTransfer(); } catch (e) { note('no DataTransfer; drag untested'); return ledger(); }
    src.draggable = true;
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    var r = dst.getBoundingClientRect();
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt, clientX: r.right - 6, clientY: r.top + 8 }));
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    setTimeout(function () {
      var now = order().join(',');
      note('drag order ' + was + ' -> ' + now + ' changed=' + (was !== now));
      API.getState().then(function (st) {
        note('persisted order=' + ((st.settings.dashLayout || {}).order || []).join(','));
        ledger();
      });
    }, 500);
  }

  function ledger() {
    nav('全部任务').click();
    setTimeout(function () {
      var row = q('#list .task');
      var rr = row.getBoundingClientRect();
      var title = row.querySelector('.task-title');
      var line = row.querySelector('.task-line');
      var dot = row.querySelector('.task-dot');
      var due = row.querySelector('.task-due');
      var lr = line.getBoundingClientRect(), tr = title.getBoundingClientRect();
      var dr = due && due.getBoundingClientRect();
      note('rowH=' + Math.round(rr.height) + ' lineH=' + Math.round(lr.height) +
        ' titleH=' + Math.round(tr.height) + ' oneLine=' + (Math.round(rr.height) <= 40) +
        ' ellipsis=' + getComputedStyle(title).textOverflow +
        ' dotBorder=' + (dot ? getComputedStyle(dot).borderStyle : '-') +
        ' flags=' + n('#list .task-flags .flag') +
        ' dueSameLine=' + !!(dr && Math.abs((dr.top + dr.height / 2) - (lr.top + lr.height / 2)) < 10) +
        ' due=' + (due ? due.textContent.replace(/\s+/g, ' ').trim() : '-'));
      mini();
    }, 900);
  }

  function mini() {
    nav('仪表盘').click();
    setTimeout(function () {
      var row = q('.mini-row');
      if (!row) { note('FAIL no mini row'); return; }
      var before = [];
      API.getState().then(function (st0) {
        before = (st0.timeEntries || []).map(function (e) { return e.id; });
        var r0 = row.getBoundingClientRect();
        note('mini rowH=' + Math.round(r0.height) + ' oneLine=' + (Math.round(r0.height) <= 34) +
          ' timer=' + !!row.querySelector('.mini-timer') +
          ' right=' + (row.querySelector('.mini-right') || { textContent: '-' }).textContent.replace(/\s+/g, ' ').trim());
        row.querySelector('.mini-timer').click();
        setTimeout(function () {
          API.getState().then(function (st) {
            var on = st.todos.filter(function (t) { return !!t.timerStartedAt; }).length;
            note('mini timer started=' + on);
            var again = q('.mini-row .mini-timer.on') || q('.mini-timer');
            again.click();
            setTimeout(function () {
              API.getState().then(function (st2) {
                note('mini timer stopped=' + st2.todos.filter(function (t) { return !!t.timerStartedAt; }).length +
                  ' spentRows=' + n('.mini-spent'));
                /* the two-second run this just wrote is not the user's history */
                var fresh = (st2.timeEntries || []).filter(function (e) { return before.indexOf(e.id) < 0; });
                var p = Promise.resolve();
                fresh.forEach(function (e) {
                  p = p.then(function () { return API.op({ type: 'timer:delete', id: e.id }); });
                });
                p.then(function () { return API.getState(); }).then(function (st3) {
                  note('cleaned runs=' + fresh.length + ' left=' + (st3.timeEntries || []).length);
                });
              });
            }, 900);
          });
        }, 900);
      });
    }, 900);
  }
})();
