/* The tracking view's new controls, plus what the export actually carries.

   Everything here is asserted against the rendered page rather than against the source: a
   pager button that exists but steps by a week, or a date field that repaints but does not
   move S.tkDay, both look finished until something reads the dial back.

   The delete is tested on a task this script created, in a group this script created, and
   todo:delete takes its time entries with it — so nothing of the user's is touched and the
   final check is that the throwaway group is gone.

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/tk-controls.js */
(function () {
  var API = window.API;
  var fails = [], notes = [];
  var groupId = null, todoId = null, ringStart = '', madeIds = [];
  function note(s) { try { API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function check(ok, label) { if (!ok) fails.push(label); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function q(sel) { return document.querySelector(sel); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function ringLabel() { var s = q('.tk-ring-hole span'); return s ? (s.textContent || '').trim() : '-'; }
  function navButton(text) {
    return all('button').filter(function (b) {
      return (b.textContent || '').indexOf(text) >= 0 && (b.textContent || '').indexOf('时间线') < 0;
    })[0];
  }

  function cleanup() {
    var mine = madeIds.concat(todoId ? [todoId] : []);
    return Promise.all(
      mine.map(function (id) {
        return API.op({ type: 'todo:delete', id: id }).catch(function () {})
          .then(function () { return API.op({ type: 'trash:purge', id: id }).catch(function () {}); });
      })
    ).then(function () {
      return groupId ? API.op({ type: 'group:delete', id: groupId }).catch(function () {}) : null;
    }).then(function () { return API.getState(); }).then(function (st) {
      var g = st.groups.filter(function (x) { return x.id === groupId; }).length;
      var t = st.todos.filter(function (x) { return mine.indexOf(x.id) >= 0; }).length;
      var e = st.timeEntries.filter(function (x) { return mine.indexOf(x.todoId) >= 0; }).length;
      var zz = st.todos.filter(function (x) { return /^ZZ /.test(x.title); }).length;
      note('cleanup groupLeft=' + g + ' todoLeft=' + t + ' entryLeft=' + e + ' zzLeft=' + zz);
      check(g === 0 && t === 0 && e === 0 && zz === 0,
        'cleanup left group=' + g + ' todo=' + t + ' entry=' + e + ' zz=' + zz);
    });
  }

  Promise.resolve()
    .then(function () { return API.getState(); })
    .then(function (st) {
      /* 9: the example sentence under the quick-add box is gone, and the row hides itself */
      var prev = q('#qaPreview');
      check(!!prev, '#qaPreview missing');
      check(prev && /u-hidden/.test(prev.className) && !(prev.textContent || '').trim(),
        'the quick-add preview still shows text with an empty input: ' +
        JSON.stringify(prev && prev.textContent));
      return API.op({ type: 'group:add', name: 'ZZ 时间轴试组', color: 'plum', activate: false });
    })
    .then(function (r) { groupId = r && r.id; return API.op({ type: 'todo:add', title: 'ZZ 时间轴控件测试', groupId: groupId }); })
    .then(function (r) {
      todoId = r && r.id;
      check(!!todoId, 'todo:add returned no id');
      var d = new Date(); d.setHours(9, 0, 0, 0);
      var e = new Date(d.getTime() + 30 * 60000);
      return API.op({ type: 'timer:add', id: todoId, start: d.toISOString(), end: e.toISOString() });
    })
    .then(function () { return wait(600); })
    .then(function () {
      var b = navButton('时间轴');
      check(!!b, 'no 时间轴 button in the nav');
      if (b) b.click();
      return wait(1200);
    })
    /* 129: the ring's own day pager */
    .then(function () {
      check(!!q('.tk-ring-row'), '.tk-ring-row wrapper missing');
      check(all('.tk-pager').length === 2, 'found ' + all('.tk-pager').length + ' ring pagers, want 2');
      ringStart = ringLabel();
      notes.push('ring0=' + ringStart);
      var nx = q('[data-tk="ringnext"]');
      check(!!nx, 'no ringnext button');
      if (nx) nx.click();
      return wait(900).then(function () { return ringLabel(); });
    })
    .then(function (after) {
      check(after !== ringStart, 'ringnext left the dial reading the same: ' + after);
      notes.push('ring1=' + after);
      var pv = q('[data-tk="ringprev"]');
      if (pv) { pv.click(); return wait(900).then(function () { return ringLabel(); }); }
      return after;
    })
    .then(function (back) {
      check(back === ringStart, 'two opposite steps did not return to the starting day: ' + back);
      /* 123: right-click the block -> menu -> delete the task */
      var blk = all('.tk-blk').filter(function (b) { return b.dataset.todo === todoId; })[0];
      check(!!blk, 'the test entry did not render as a .tk-blk');
      if (!blk) return null;
      blk.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
      return wait(250).then(function () {
        var menu = q('.tk-ctx');
        check(!!menu, 'no context menu after right-clicking a block');
        if (!menu) return null;
        var btns = all('.tk-ctx .btn');
        check(btns.length === 2, 'context menu has ' + btns.length + ' items, want 2');
        check(/删除任务/.test(btns[0].textContent || ''), 'first item is not the task delete: ' + btns[0].textContent);
        btns[0].click();
        return wait(900);
      });
    })
    .then(function () {
      if (q('.tk-ctx')) fails.push('the context menu did not close after choosing an item');
      return API.getState();
    })
    .then(function (st) {
      check(!st.todos.some(function (t) { return t.id === todoId; }), 'the task survived the right-click delete');
      check(!st.timeEntries.some(function (e) { return e.todoId === todoId; }),
        'todo:delete left the time entry behind');
      todoId = null;   /* already deleted; cleanup must not try again */
      /* 130: the date jump */
      var jump = q('#tkJump');
      check(!!jump, 'no #tkJump date field beside 今天');
      if (!jump) return null;
      jump.value = '2026-12-25';
      jump.dispatchEvent(new Event('change', { bubbles: true }));
      return wait(1000).then(function () { return ringLabel(); });
    })
    .then(function (label) {
      if (label === undefined || label === null) return null;
      check(/12\/25/.test(label), 'after jumping to 2026-12-25 the ring reads ' + JSON.stringify(label));
      notes.push('jump=' + label);
      /* 124: the assign popover offers a group */
      var grp = q('[data-tk="grp"]');
      notes.push('grpInDom=' + (grp ? grp.options.length : 'popover closed'));
      return null;
    })
    /* 124: drag a span on an empty axis, and the assign box must let the new task choose
       its group — asserted by making the task and reading the group back off the store */
    .then(function () {
      var col = q('.tk-col');
      check(!!col, 'no .tk-col to drag on');
      if (!col) return null;
      var r = col.getBoundingClientRect();
      var x = r.left + r.width / 2, y0 = r.top + 20, y1 = r.top + 130;
      function pe(type, y, target) {
        (target || col).dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerId: 7, isPrimary: true, clientX: x, clientY: y
        }));
      }
      pe('pointerdown', y0);
      pe("pointermove", y0 + 40, document);
      pe("pointermove", y1, document);
      pe("pointerup", y1, document);
      return wait(700).then(function () { return q('.tk-pop [data-tk="grp"]'); });
    })
    .then(function (grp) {
      check(!!grp, 'dragging the axis did not open an assign box with a group select');
      if (!grp) return null;
      check(grp.options.length >= 2, 'the group select has ' + grp.options.length + ' options');
      var names = Array.prototype.map.call(grp.options, function (o) { return o.textContent; });
      check(names.some(function (n) { return /ZZ 时间轴试组/.test(n); }),
        'the throwaway group is not offered: ' + JSON.stringify(names));
      grp.value = groupId;
      var box = q('.tk-pop [data-tk="new"]');
      box.value = 'ZZ 拖拽分组测试';
      q('.tk-pop [data-tk="go"]').click();
      return wait(900);
    })
    .then(function () { return API.getState(); })
    .then(function (st) {
      var made = st.todos.filter(function (t) { return t.title === 'ZZ 拖拽分组测试'; });
      check(made.length === 1, 'the drag-and-create made ' + made.length + ' tasks, want 1');
      if (made.length === 1) {
        check(made[0].groupId === groupId,
          'the new task landed in ' + made[0].groupId + ', want the chosen ' + groupId);
        madeIds.push(made[0].id);
        notes.push('grpPick=' + (made[0].groupId === groupId ? 'ok' : 'wrong'));
      }
    })
    /* 128: what the export carries */
    .then(function () { return API.exportData(); })
    .then(function (text) {
      var s = JSON.parse(text);
      ['version', 'groups', 'todos', 'settings', 'timeEntries', 'placements'].forEach(function (k) {
        check(k in s, 'export is missing ' + k);
      });
      check(s.settings && s.settings.dashLayout && Array.isArray(s.settings.dashLayout.order),
        'export has no settings.dashLayout.order — the dashboard layout would not come back');
      var open = s.todos.filter(function (t) { return !t.done; })[0] || s.todos[0];
      check(!!open, 'export has no todos at all');
      if (open) {
        ['id', 'groupId', 'title', 'notes', 'done', 'priority', 'repeat', 'lunar', 'tags',
          'createdAt', 'dueAt', 'spentMs', 'pinned', 'order'].forEach(function (f) {
          check(f in open, 'an exported todo is missing ' + f);
        });
      }
      notes.push('export todos=' + s.todos.length + ' groups=' + s.groups.length +
        ' entries=' + s.timeEntries.length + ' dashOrder=' +
        (s.settings.dashLayout ? s.settings.dashLayout.order.length : 0));
    })
    .catch(function (e) { fails.push('threw: ' + (e && e.message)); })
    .then(cleanup)
    .catch(function (e) { note('CLEANUP THREW ' + (e && e.message)); })
    .then(function () {
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS') + ' ' + notes.join(' | '));
    });
})();
