/* The recycle bin.

   Four things are pinned here, and the first is the reason the bin is a separate array
   rather than a group: a deleted task must be invisible to every view that reads `todos`
   without any of them having to remember to filter.

   1. delete files it rather than destroying it, and restore gives it back whole;
   2. the sidebar row stays the last one even after a new group is created;
   3. thirty days is measured on the read, so a machine off for a month comes back to an
      emptied bin — tested by normalising a synthetic state rather than by waiting;
   4. the view renders its own rows, with the two actions on them.

   Everything is created in a throwaway group and purged at the end, pass or fail, so
   nothing of the user's own bin is left touched.

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/recycle-bin.js */
(function () {
  var API = window.API;
  var fails = [], notes = [];
  var groupId = null, extraGroup = null, ids = [], D = window.NeonData;
  function note(s) { try { API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function check(ok, label) { if (!ok) fails.push(label); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function inTodos(st, id) { return st.todos.some(function (t) { return t.id === id; }); }
  function inTrash(st, id) {
    return (st.trash || []).filter(function (x) { return x.todo.id === id; })[0] || null;
  }

  function cleanup() {
    return Promise.all(ids.map(function (id) {
      return API.op({ type: 'todo:delete', id: id }).catch(function () {})
        .then(function () { return API.op({ type: 'trash:purge', id: id }).catch(function () {}); });
    })).then(function () {
      return Promise.all([groupId, extraGroup].filter(Boolean).map(function (g) {
        return API.op({ type: 'group:delete', id: g }).catch(function () {});
      }));
    }).then(function () { return API.getState(); }).then(function (st) {
      var zz = st.todos.concat((st.trash || []).map(function (x) { return x.todo; }))
        .filter(function (t) { return /^ZZ 垃圾箱/.test(t.title); }).length;
      var g = st.groups.filter(function (x) { return /^ZZ /.test(x.name); }).length;
      note('cleanup zzLeft=' + zz + ' groupLeft=' + g);
      check(zz === 0 && g === 0, 'cleanup left zz=' + zz + ' group=' + g);
    });
  }

  Promise.resolve()
    .then(function () { return API.getState(); })
    .then(function (st) {
      notes.push('bin0=' + (st.trash || []).length);
      return API.op({ type: 'group:add', name: 'ZZ 垃圾箱试组', color: 'slate', activate: false });
    })
    .then(function (r) { groupId = r && r.id; return API.op({ type: 'todo:add', title: 'ZZ 垃圾箱任务', groupId: groupId, notes: '详情要跟着回来' }); })
    .then(function (r) { ids.push(r.id); return API.op({ type: 'todo:add', title: 'ZZ 垃圾箱第二张', groupId: groupId }); })
    .then(function (r) { ids.push(r.id); return wait(600); })
    /* 1: delete files, restore returns */
    .then(function () { return API.op({ type: 'todo:delete', id: ids[0] }); })
    .then(function () { return wait(500); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      check(!inTodos(st, ids[0]), 'the task is still in todos after delete');
      var rec = inTrash(st, ids[0]);
      check(!!rec, 'the task did not land in the bin');
      if (rec) {
        check(!!rec.deletedAt, 'the bin entry has no deletedAt');
        check(rec.todo.notes === '详情要跟着回来', 'the bin lost the details: ' + JSON.stringify(rec.todo.notes));
      }
      check(inTodos(st, ids[1]), 'delete took the other task too');
      return API.op({ type: 'trash:restore', id: ids[0] });
    })
    .then(function () { return wait(500); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      check(inTodos(st, ids[0]), 'restore did not put the task back');
      check(!inTrash(st, ids[0]), 'restore left a copy in the bin');
      var back = st.todos.filter(function (t) { return t.id === ids[0]; })[0];
      check(back && back.groupId === groupId, 'restore moved it to the wrong group');
      check(back && back.notes === '详情要跟着回来', 'restore lost the notes');
      /* 2: the bin row is last, even beside a brand new group */
      return API.op({ type: 'group:add', name: 'ZZ 垃圾箱新组', color: 'khaki', activate: false });
    })
    .then(function (r) {
      extraGroup = r && r.id;
    })
    .then(function (r) {
      var rows = Array.prototype.slice.call(document.querySelectorAll('.group-list li'));
      var last = rows[rows.length - 1];
      check(last && last.classList.contains('trash-row'),
        'the last sidebar row is not the bin: ' + JSON.stringify(last && last.className));
      check(rows.filter(function (x) { return x.classList.contains('trash-row'); }).length === 1,
        'more than one bin row in the sidebar');
      check(/回收站/.test(last.textContent || ''), 'the bin row does not say 回收站');
      /* and something for it to show: the earlier steps restored their only candidate */
      return API.op({ type: 'todo:delete', id: ids[1] }).then(function () {
        return wait(400);
      }).then(function () {
        if (last) last.click();
        return wait(700);
      });
    })
    /* 4: the view */
    .then(function () {
      /* count the rows this run created, not everything starting with ZZ: another test's
         leftover in the bin is not this test's business, and conflating the two once made a
         passing run look broken */
      var items = Array.prototype.filter.call(document.querySelectorAll('.tr-item'), function (r) {
        var t = ((r.querySelector('.tr-title') || {}).textContent || '');
        return /^ZZ 垃圾箱/.test(t);
      });
      check(items.length === 1, 'the bin view shows ' + items.length + ' of my own rows, want 1');
      var first = items[0];
      if (first) {
        check(!!first.querySelector('[data-tr="restore"]'), 'a bin row has no 恢复 button');
        check(!!first.querySelector('[data-tr="purge"]'), 'a bin row has no 彻底删除 button');
        var purge = first.querySelector('[data-tr="purge"]');
        check(purge.textContent.indexOf('确定') < 0, 'purge destroyed on the first click');
        purge.click();
        return wait(200).then(function () {
          var again = document.querySelector('[data-tr="purge"]');
          check(again && /确定/.test(again.textContent), 'the confirm step did not appear');
          if (again) again.click();
          return wait(600);
        });
      }
      return null;
    })
    .then(function () { return API.getState(); })
    .then(function (st) {
      check(!inTrash(st, ids[1]), 'the second click of 彻底删除 did not purge');
      /* 3: the 30-day rule, measured on the read */
      var base = D.defaultState();
      var syn = JSON.parse(JSON.stringify(base));
      var mk = function (id, days) {
        var t = JSON.parse(JSON.stringify(base.todos[0] || { id: 'x', title: 't' }));
        t.id = id; t.title = 'SYN ' + id;
        return { todo: t, deletedAt: new Date(Date.now() - days * 86400000).toISOString() };
      };
      syn.trash = [mk('old', 31), mk('edge', 29), mk('fresh', 0)];
      var kept = D.normalize(syn).trash.map(function (x) { return x.todo.id; });
      check(kept.indexOf('old') < 0, 'a 31-day-old entry survived the normalise');
      check(kept.indexOf('edge') >= 0 && kept.indexOf('fresh') >= 0,
        'young entries were purged too: ' + JSON.stringify(kept));
      notes.push('kept=' + JSON.stringify(kept));
      /* the bin is part of what an export has to carry */
      return API.exportData();
    })
    .then(function (text) {
      check('trash' in JSON.parse(text), 'the export does not carry the bin — a restored machine would lose it');
    })
    .catch(function (e) { fails.push('threw: ' + (e && e.message)); })
    .then(cleanup)
    .catch(function (e) { note('CLEANUP THREW ' + (e && e.message)); })
    .then(function () {
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS') + ' ' + notes.join(' | '));
    });
})();
