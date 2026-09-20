/* Panel side of this batch: the module grid must fill a maximised window, the clock
   must keep its own typography, the drag must work with pointer events (not HTML5
   dnd), the elapsed marker must not change glyph between renders, and the hover
   buttons must sit on the title's shoulder instead of the right edge. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[E] ' + s); } catch (e) { /* no bridge */ } }
  function q(s) { return document.querySelector(s); }
  function qa(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function nav(t) {
    return qa('#navFilters button').filter(function (x) { return x.textContent.indexOf(t) >= 0; })[0];
  }
  function box(el) { var r = el.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }
  function order() {
    return qa('#dashGrid .mod').map(function (m) { return m.dataset.mod; });
  }
  function ptr(type, target, x, y) {
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse',
      button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y
    }));
  }

  nav('仪表盘').click();
  setTimeout(fill, 900);

  /* ---- 1. maximised: the last row has to reach the bottom of the page ---- */
  function fill() {
    var max = q('#btnMax');
    if (max) max.click();
    setTimeout(function () {
      var grid = q('#dashGrid');
      var main = q('.main');
      var mods = qa('#dashGrid .mod');
      var gr = grid.getBoundingClientRect();
      var lowest = 0;
      var tallest = 0;
      mods.forEach(function (m) {
        var r = m.getBoundingClientRect();
        if (r.bottom > lowest) lowest = r.bottom;
        if (r.height > tallest) tallest = r.height;
      });
      var mr = main.getBoundingClientRect();
      note('max main ' + box(main) + ' grid ' + box(grid) +
        ' deadBottom=' + Math.round(mr.bottom - lowest) +
        ' scrolls=' + (main.scrollHeight > main.clientHeight + 2) +
        ' tallestMod=' + Math.round(tallest));
      clock();
    }, 1200);
  }

  /* ---- 2. the clock keeps the size it had before the grid rewrite ---- */
  function clock() {
    var t = q('#clockTime'), d = q('#clockDate'), w = q('#clockWeek');
    var fs = function (el) { return el ? Math.round(parseFloat(getComputedStyle(el).fontSize)) : 0; };
    note('clock font ' + fs(t) + '/' + fs(d) + '/' + fs(w) +
      ' text=' + (t ? t.textContent : '-') +
      ' centred=' + !!(t && Math.abs((t.getBoundingClientRect().left + t.getBoundingClientRect().right) / 2 -
        q('#modClock').getBoundingClientRect().left - q('#modClock').getBoundingClientRect().width / 2) < 3));
    spent();
  }

  /* ---- 3. a rebuild must not add or drop the watch glyph ---- */
  function spent() {
    var row = q('.mini-row');
    if (!row || !row.querySelector('.mini-spent')) { note('spentRows=0 (nothing timed yet)'); drag(); return; }
    var before = q('.mini-spent').textContent;
    /* any store write re-renders the dashboard; the tick adds its own text a second
       later, so build-time and tick-time strings have to be the same or it blinks */
    API.op({ type: 'settings:update', patch: { opacity: 1 } }).then(function () {
      var fresh = q('.mini-spent') ? q('.mini-spent').textContent : '-';
      setTimeout(function () {
        var ticked = q('.mini-spent') ? q('.mini-spent').textContent : '-';
        note('spent built=' + JSON.stringify(fresh) + ' watch=' + (fresh.charCodeAt(0) === 0x23F1) +
          ' afterTick=' + JSON.stringify(ticked) +
          ' stable=' + (fresh.replace(/[\d:]+$/, '') === ticked.replace(/[\d:]+$/, '')));
        void before;
        drag();
      }, 1400);
    });
  }

  /* ---- 4. pointer drag: grab a head, walk over a neighbour, let go ---- */
  function drag() {
    var mods = qa('#dashGrid .mod');
    var src = mods[0], dst = mods[2];
    var was = order().join(',');
    var head = src.querySelector('.mod-head');
    var hr = head.getBoundingClientRect();
    var dr = dst.getBoundingClientRect();
    note('draggableAttr=' + src.draggable + ' cursor=' + getComputedStyle(head).cursor);
    ptr('pointerdown', head, hr.left + 30, hr.top + 6);
    ptr('pointermove', window, hr.left + 30, hr.top + 6);
    ptr('pointermove', window, dr.right - 10, dr.top + 10);
    ptr('pointermove', window, dr.right - 10, dr.top + 12);
    ptr('pointerup', window, dr.right - 10, dr.top + 12);
    setTimeout(function () {
      var now = order().join(',');
      note('pointer drag ' + was + ' -> ' + now + ' changed=' + (was !== now) +
        ' ghost=' + qa('.dragging-mod').length + ' reordering=' + qa('#dashGrid.reordering').length);
      API.getState().then(function (st) {
        note('persisted order=' + ((st.settings.dashLayout || {}).order || []).join(','));
        ledger();
      });
    }, 600);
  }

  /* ---- 5. the hover buttons belong to the title, not to the right edge ---- */
  function ledger() {
    nav('全部任务').click();
    setTimeout(function () {
      var row = q('#list .task');
      var rr = row.getBoundingClientRect();
      var title = row.querySelector('.task-title');
      var actions = row.querySelector('.task-actions');
      var due = row.querySelector('.task-due');
      var right = row.querySelector('.task-right');
      var tr = title.getBoundingClientRect(), ar = actions.getBoundingClientRect();
      var dr = due.getBoundingClientRect(), wr = right.getBoundingClientRect();
      note('actionsInLine=' + !!actions.closest('.task-line') +
        ' actionsAfterTitle=' + (ar.left >= tr.right - 1) +
        ' gapTitleActions=' + Math.round(ar.left - tr.right) +
        ' actionsBeforeDot=' + (ar.right <= wr.left + 1) +
        ' dotRight=' + Math.round(rr.right - wr.right) +
        ' dueRight=' + Math.round(rr.right - dr.right) +
        ' rowH=' + Math.round(rr.height) +
        ' oneLine=' + (Math.round(rr.height) <= 42));
      API.getState().then(function (st) {
        var act = st.settings.activeGroupId;
        var cand = st.todos.filter(function (t) {
          /* a task with no spot on the desk yet: the test invents one and throws it away */
          return t.groupId !== act && !t.done && !(st.placements || {})[t.id];
        });
        var other = cand[cand.length - 1];
        note('offGroupTask=' + (other ? other.id + ' ' + other.groupId : 'none') + ' active=' + act);
        if (other) {
          var row2 = qa('#list .task').filter(function (r) { return r.dataset.id === other.id; })[0];
          if (row2) {
            row2.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            var pin = row2.querySelector('[data-act="pin"]');
            pin.click();
            setTimeout(function () {
              API.getState().then(function (st2) {
                var p = st2.placements[other.id];
                note('pin click pinned=' + !!(p && p.pinned) + ' spot=' + (p ? Math.round(p.x) + ',' + Math.round(p.y) : '-') +
                  ' btnLabel=' + (q('#list .task[data-id="' + other.id + '"] [data-act="pin"]') || { title: '-' }).title);
                /* leave the desk as we found it */
                API.op({ type: 'todo:deploy', id: other.id }).then(function () {
                  API.op({ type: 'placement:delete', todoId: other.id }).then(function () {
                    API.getState().then(function (st3) {
                      note('unpinned=' + !st3.placements[other.id] + ' (spot removed too)');
                    });
                  });
                });
              });
            }, 900);
          } else {
            note('FAIL off-group task not in this view');
          }
        }
      });
    }, 900);
  }
})();
