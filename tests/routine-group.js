/* The routine group: cards that tick themselves off — and still tell you they did.

   A group flagged autoDone is a log of what the day demands (eat, sleep, wash), so its cards
   complete on time without a click, and a repeating one rolls to its next occurrence exactly
   as it would by hand. The user has since corrected the original brief: the due notification
   is wanted as well, so this asserts BOTH — the card ends up done, and the reminder path ran.

   The previous version of this test "proved" the quiet half by leaving remindedAt null — with
   a due time sixty seconds in the PAST, which is precisely the case the born-overdue rule
   exempts from reminders. The assertion could not have failed. So: due time in the future,
   notifications counted on the wire rather than inferred from a stamp, and a settings snapshot
   restored at the end because reminders is the user's own switch.

   Runs in a throwaway group with one repeating task, and deletes the original, the spawned
   next occurrence and the group at the end, pass or fail.

   Run on the second display:
     pin-tauri.exe --monitor 2 --test-script tests/routine-group.js */
(function () {
  var API = window.API;
  var fails = [], notes = [];
  var groupId = null, todoId = null, spawnId = null, wasReminders = null;
  var seen = [];
  function note(s) { try { API.bootNote('[S] ' + s); } catch (e) { /* no bridge */ } }
  function check(ok, label) { if (!ok) fails.push(label); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function find(st, id) { return st.todos.filter(function (t) { return t.id === id; })[0] || null; }

  /* the layer calls API.notify at fire time, so wrapping the bridge method sees the real
     announcement without adding a counter to production code */
  var realNotify = API.notify;
  API.notify = function (title, body) { seen.push(String(body || title)); return realNotify.apply(API, arguments); };

  function cleanup() {
    API.notify = realNotify;
    return Promise.all([todoId, spawnId].filter(Boolean).map(function (id) {
      return API.op({ type: 'todo:delete', id: id }).catch(function () {})
        .then(function () { return API.op({ type: 'trash:purge', id: id }).catch(function () {}); });
    })).then(function () {
      return groupId ? API.op({ type: 'group:delete', id: groupId }).catch(function () {}) : null;
    }).then(function () {
      return wasReminders === null ? null :
        API.op({ type: 'settings:update', patch: { reminders: wasReminders } }).catch(function () {});
    }).then(function () { return API.getState(); }).then(function (st) {
      var g = st.groups.filter(function (x) { return x.id === groupId; }).length;
      var zz = st.todos.filter(function (t) { return /^ZZ /.test(t.title); }).length;
      note('cleanup groupLeft=' + g + ' zzLeft=' + zz + ' reminders=' + st.settings.reminders);
      check(g === 0 && zz === 0, 'cleanup left group=' + g + ' tasks=' + zz);
    });
  }

  Promise.resolve()
    .then(function () { return API.getState(); })
    .then(function (st) {
      wasReminders = st.settings.reminders !== false;
      if (!wasReminders) return API.op({ type: 'settings:update', patch: { reminders: true } });
      return null;
    })
    .then(function () {
      return API.op({ type: 'group:add', name: 'ZZ 作息试组', color: 'forest', activate: false, autoDone: true });
    })
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
      /* ahead of now, so the born-overdue exemption cannot be what silences the reminder */
      var due = new Date(Date.now() + 12000).toISOString();
      return API.op({ type: 'todo:add', title: 'ZZ 作息：喝水', groupId: groupId, dueAt: due, repeat: 'daily' });
    })
    .then(function (r) {
      todoId = r && r.id;
      check(!!todoId, 'todo:add returned no id');
      notes.push('due in 12s');
      /* dayTick runs 3 s after boot and every 20 s after, so this waits for the pass that
         finds the task overdue */
      return wait(26000);
    })
    .then(function () { return API.getState(); })
    .then(function (st) {
      var t = find(st, todoId);
      check(!!t, 'the task vanished');
      if (t) {
        check(t.done === true, 'the routine task was not auto-completed (done=' + t.done + ')');
        check(!!t.remindedAt, 'the reminder never ran: remindedAt is null');
        notes.push('remindedAt=' + (t.remindedAt || 'null'));
      }
      check(seen.some(function (s) { return s.indexOf('ZZ 作息：喝水') >= 0; }),
        'no notification reached the bridge: ' + JSON.stringify(seen));
      notes.push('notify=' + seen.length);
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
