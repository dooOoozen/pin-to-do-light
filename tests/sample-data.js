/* 「载入示例数据」must never cost anybody their board. The other button in the same panel
   really does — data:reset replaces the whole file — and that is how a set of real tasks went
   missing during a session of testing this app, so this test exists to keep the two apart.

   It clicks the actual buttons in the actual settings modal, because the guard is that the
   button does what it says: calling the reducer directly would test the reducer and not the
   thing the user presses. What it asserts is the untouched set: every task id that existed
   before the load still exists afterwards, in the same order, and the clear takes away exactly
   the fifty that came in — including the two sample groups and the timing runs hanging off them.

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/sample-data.js */
(function () {
  var API = window.API;
  var fails = [], notes = [];
  function note(s) { try { API.bootNote('[Z] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function check(ok, label) { if (!ok) fails.push(label); }
  function ids(list) { return list.map(function (t) { return t.id; }).join(','); }

  Promise.resolve().then(function () { return wait(2400); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      var base = { todos: ids(st.todos), gids: ids(st.groups), trash: (st.trash || []).length,
        entries: (st.timeEntries || []).length, active: st.settings.activeGroupId };
      notes.push('before todos=' + st.todos.length + ' groups=' + st.groups.length);
      document.getElementById('btnSettings').click();
      return wait(700).then(function () { return base; });
    })
    .then(function (base) {
      var load = document.querySelector('[data-act="sampleLoad"]');
      var clear = document.querySelector('[data-act="sampleClear"]');
      check(!!load && !!clear, 'the sample buttons are not in the settings modal');
      if (!load || !clear) return base;
      load.click();
      return wait(1600).then(function () { return API.getState(); }).then(function (st) {
        var added = st.todos.length - base.todos.split(',').filter(Boolean).length;
        check(added === 50, 'loading the sample added ' + added + ' rows, want 50');
        check(ids(st.todos).indexOf(base.todos.split(',')[0]) >= 0 || !base.todos,
          'the first existing task is gone');
        var kept = base.todos ? base.todos.split(',').every(function (id) {
          return st.todos.some(function (t) { return t.id === id; });
        }) : true;
        check(kept, 'a task that existed before the load is missing afterwards');
        check(st.settings.activeGroupId === base.active, 'the sample hijacked the active group');
        check((st.trash || []).length === base.trash, 'the load put rows in the recycle bin');
        notes.push('after load todos=' + st.todos.length + ' groups=' + st.groups.length +
          ' entries=' + st.timeEntries.length + ' (+ ' + (st.timeEntries.length - base.entries) + ' runs)');
        check(st.groups.length >= base.gids.split(',').length + 2, 'the two sample groups did not arrive');
        clear.click();
        return wait(1600).then(function () { return API.getState(); }).then(function (back) {
          check(ids(back.todos) === base.todos, 'the clear did not restore the original task set');
          check(ids(back.groups) === base.gids, 'the clear left groups behind: ' + back.groups.map(function (g) {
            return g.name;
          }).join(','));
          check((back.trash || []).length === base.trash, 'the clear dumped fifty rows into the recycle bin');
          check(back.settings.activeGroupId === base.active, 'the active group moved during the round trip');
          notes.push('after clear todos=' + back.todos.length + ' groups=' + back.groups.length);
          return null;
        });
      });
    })
    .then(function () {
      var c = document.querySelector('[data-act="done"]');
      if (c) c.click();
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS') + ' ' + notes.join(' | '));
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
