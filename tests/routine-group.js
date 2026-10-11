/* The routine group: cards that tick themselves off.

   A group flagged autoDone is a log of what the day demands — eat, sleep, wash — so its
   cards complete on time without a click and without a notification, and a repeating one
   rolls to its next occurrence exactly as it would if you had ticked it by hand. Undoing it
   is still just an ordinary edit.

   The assertion that matters is the quiet one: the reminder path stamps remindedAt before it
   notifies, so remindedAt staying null is the evidence that nothing was announced.

   Runs in a throwaway group with one repeating task, and deletes the original, the spawned
   next occurrence and the group at the end, pass or fail.

   Run on the second display:
     pin-tauri.exe --monitor 2 --test-script tests/routine-group.js */
(function () {
  var API = window.API;
  var fails = [], notes = [];
  var groupId = null, todoId = null, spawnId = null;
  function note(s) { try { API.bootNote('[S] ' + s); } catch (e) { /* no bridge */ } }
  function check(ok, label) { if (!ok) fails.push(label); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function find(st, id) { return st.todos.filter(function (t) { return t.id === id; })[0] || null; }

  function cleanup() {
    return Promise.all([todoId, spawnId].filter(Boolean).map(function (id) {
      return API.op({ type: 'todo:delete', id: id }).catch(function () {});
    })).then(function () {
      return groupId ? API.op({ type: 'group:delete', id: groupId }).catch(function () {}) : null;
    }).then(function () { return API.getState(); }).then(function (st) {
      var g = st.groups.filter(function (x) { return x.id === groupId; }).length;
      var zz = st.todos.filter(function (t) { return /^ZZ /.test(t.title); }).length;
      note('cleanup groupLeft=' + g + ' zzLeft=' + zz);
      check(g === 0 && zz === 0, 'cleanup left group=' + g + ' tasks=' + zz);
    });
  }

  Promise.resolve()
    .then(function () { return API.op({ type: 'group:add', name: 'ZZ 作息试组', color: 'forest', activate: false, autoDone: true }); })
    .then(function (r) {
      groupId = r && r.id;
      check(!!groupId, 'group:add returned no id');
      return wait(700);
    })
    .then(function () { return API.getState(); })
    .then(function (st) {
      var g = st.groups.filter(function (x) { return x.id === groupId; })[0];
      /* normalize drops an unknown key silently, and then every later assertion passes for
         the wrong reason — the flag has to survive the round trip through the store */
      check(g && g.autoDone === true, 'autoDone did not survive the store: ' + JSON.stringify(g));
      var due = new Date(Date.now() - 60000).toISOString();
      return API.op({ type: 'todo:add', title: 'ZZ 作息：喝水', groupId: groupId, dueAt: due, repeat: 'daily' });
    })
    .then(function (r) {
      todoId = r && r.id;
      check(!!todoId, 'todo:add returned no id');
      notes.push('due 60s ago, waiting for the tick');
      /* dayTick runs 3 s after boot and every 20 s after, so one wait covers the next pass */
      return wait(21000);
    })
    .then(function () { return API.getState(); })
    .then(function (st) {
      var t = find(st, todoId);
      check(!!t, 'the task vanished');
      if (t) {
        check(t.done === true, 'the routine task was not auto-completed (done=' + t.done + ')');
        check(!t.remindedAt, 'it was treated as a reminder instead: remindedAt=' + t.remindedAt);
      }
      var sp = st.todos.filter(function (x) { return x.spawnedFrom === todoId; })[0];
      check(!!sp, 'a daily routine did not roll to its next occurrence');
      if (sp) {
        spawnId = sp.id;
        check(sp.done === false, 'the next occurrence arrived already done');
        var next = new Date(sp.dueAt).getTime();
        check(next > Date.now(), 'the next occurrence is not in the future: ' + sp.dueAt);
        notes.push('spawned=' + sp.dueAt);
      }
      /* undoing it by hand must still work, and must not re-fire immediately */
      return API.op({ type: 'todo:toggle', id: todoId });
    })
    .then(function () { return API.getState(); })
    .then(function (st) {
      var t = find(st, todoId);
      check(t && t.done === false, 'undoing the auto-completion did not take: ' + JSON.stringify(t && t.done));
    })
    .catch(function (e) { fails.push('threw: ' + (e && e.message)); })
    .then(cleanup)
    .catch(function (e) { note('CLEANUP THREW ' + (e && e.message)); })
    .then(function () {
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS') + ' ' + notes.join(' | '));
    });
})();
