/* The scatter hotkey, end to end.

   The key itself can't be pressed from here — it is a system-wide registration the host owns
   — so the test fires the same {type:'tray'} payload onto the same Tauri event bus the host
   emits, which covers everything from the listener down.

   Two things are pinned. One is the obvious one: a press puts the deck's own group out on the
   desk and pinned, and a second press brings it back. The other is why this test exists —
   visibleTodos() also carries pinned cards from *other* groups, because a pinned card belongs
   to the desk rather than to whichever deck is open, and the first version of the feature
   swept them away on the release. So the test pins a card in group B, walks the deck over to
   group A, toggles A twice, and insists B is still out there afterwards.

   That check has to be manufactured rather than observed: on a board where nothing happens to
   be pinned the assertion passes without testing anything, which is the exact shape of the
   false greens this rig exists to catch.

   Two throwaway groups, three temporary todos, all of it — placements included — deleted at
   the end, pass or fail, and the deck is clicked back to the group it started on.

   Run on the second display:
     pin-tauri.exe --monitor 2 --test-script tests/scatter-key.js */
(function () {
  var API = window.API;
  var fails = [], notes = [];
  var gA = null, gB = null, idsA = [], idB = null, homeGroup = null;
  function note(s) { try { API.bootNote('[S] ' + s); } catch (e) { /* no bridge */ } }
  function check(ok, label) { if (!ok) fails.push(label); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function press() { return window.__TAURI__.event.emit('command', { type: 'tray', action: 'scatter' }); }
  function mode() { return document.body.dataset.mode; }
  function chip(id) { return document.querySelector('.gchip[data-group="' + id + '"]'); }
  function goChip(id, label) {
    var c = chip(id);
    check(!!c, label + ': no group chip for ' + id);
    if (c) c.click();
    return wait(900);
  }
  function isPinned(st, id) { return !!((st.placements || {})[id] || {}).pinned; }
  function cardsFor(re) {
    return Array.prototype.filter.call(document.querySelectorAll('.todo-card'), function (c) {
      return re.test(c.textContent || '');
    });
  }
  function pinnedAmong(st, ids) { return ids.filter(function (i) { return isPinned(st, i); }).length; }

  function cleanup() {
    if (homeGroup && chip(homeGroup)) chip(homeGroup).click();
    return wait(500).then(function () {
      return Promise.all(idsA.concat(idB ? [idB] : []).map(function (id) {
        /* delete now files the task in the recycle bin, so a test that only deletes leaves
           its own scaffolding sitting in the user's bin */
        return API.op({ type: 'todo:delete', id: id }).catch(function () { /* already gone */ })
          .then(function () { return API.op({ type: 'trash:purge', id: id }).catch(function () {}); });
      }));
    }).then(function () {
      return Promise.all([gA, gB].map(function (g) {
        return g ? API.op({ type: 'group:delete', id: g }).catch(function () {}) : null;
      }));
    }).then(function () { return API.getState(); }).then(function (st) {
      var all = idsA.concat(idB ? [idB] : []);
      var left = st.todos.filter(function (t) { return all.indexOf(t.id) >= 0; }).length;
      var spots = all.filter(function (id) { return !!st.placements[id]; }).length;
      var groups = st.groups.filter(function (g) { return g.id === gA || g.id === gB; }).length;
      var stillPinned = pinnedAmong(st, all);
      note('cleanup tempLeft=' + left + ' placementsLeft=' + spots + ' groupLeft=' + groups +
        ' pinnedLeft=' + stillPinned);
      check(left === 0 && spots === 0 && groups === 0 && stillPinned === 0,
        'cleanup left ' + left + ' todos / ' + spots + ' placements / ' + groups + ' groups');
    });
  }

  Promise.resolve()
    .then(function () { return API.getState(); })
    .then(function (st) {
      homeGroup = st.settings.activeGroupId;
      check(pinnedAmong(st, st.todos.map(function (t) { return t.id; })) === 0,
        'the board already has pinned cards; the test would not be able to tell its own writes apart');
      note('begin home=' + homeGroup);
      return API.op({ type: 'group:add', name: 'ZZ 快捷键甲组', color: 'slate', activate: false });
    })
    .then(function (r) { gA = r && r.id; return API.op({ type: 'group:add', name: 'ZZ 快捷键乙组', color: 'sage', activate: false }); })
    .then(function (r) { gB = r && r.id; check(!!gA && !!gB, 'a group was not created'); return wait(700); })
    .then(function () {
      return Promise.all([
        API.op({ type: 'todo:add', title: '快捷键散布甲一', groupId: gA }),
        API.op({ type: 'todo:add', title: '快捷键散布甲二', groupId: gA }),
        API.op({ type: 'todo:add', title: '快捷键散布乙一', groupId: gB })
      ]);
    })
    .then(function (made) {
      idsA = [made[0] && made[0].id, made[1] && made[1].id].filter(Boolean);
      idB = made[2] && made[2].id;
      check(idsA.length === 2 && !!idB, 'todos not created: ' + JSON.stringify(made));
      return wait(900);
    })
    /* pin one card in group B, by hand, so there is something to sweep */
    .then(function () { return goChip(gB, 'switch to 乙'); })
    .then(function () {
      check(cardsFor(/快捷键散布乙/).length === 1, 'group B does not show its one card');
      return press();
    })
    .then(function () { return wait(1500); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      check(isPinned(st, idB), 'the hotkey did not pin group B\'s card in the first place');
      notes.push('B pinned=' + pinnedAmong(st, [idB]));
      return goChip(gA, 'switch to 甲');
    })
    /* now the real sequence, with B's card sitting on the desk the whole time */
    .then(function () {
      check(cardsFor(/快捷键散布甲/).length === 2, 'group A does not show its two cards');
      check(cardsFor(/快捷键散布乙/).length === 1, 'B\'s pinned card vanished when the deck moved');
      return press();
    })
    .then(function () { return wait(1500); })
    .then(function () {
      check(mode() === 'deployed', 'after press 1: mode=' + mode() + ', want deployed');
      check(cardsFor(/快捷键散布甲/).filter(function (c) {
        return c.classList.contains('pinned'); }).length === 2,
        'after press 1: A\'s two cards are not both pinned in the DOM');
      return API.getState();
    })
    .then(function (st) {
      check(pinnedAmong(st, idsA) === 2, 'after press 1: A pinned ' + pinnedAmong(st, idsA) + ', want 2');
      check(isPinned(st, idB), 'after press 1: B\'s card stopped being pinned');
      return press();
    })
    .then(function () { return wait(1500); })
    .then(function () {
      check(mode() !== 'deployed', 'after press 2: mode=' + mode() + ', want it to have come back');
      return API.getState();
    })
    .then(function (st) {
      check(pinnedAmong(st, idsA) === 0, 'after press 2: A still pins ' + pinnedAmong(st, idsA) + ', want 0');
      /* the regression: releasing A must leave the other group's pinned card alone */
      check(isPinned(st, idB),
        'REGRESSION: releasing group A swept away the pinned card that belongs to group B');
      check(cardsFor(/快捷键散布乙/).length === 1,
        'after press 2: B\'s pinned card left the desk — it should stay out');
      notes.push('press2 A=' + pinnedAmong(st, idsA) + ' B=' + (isPinned(st, idB) ? 1 : 0));
      return goChip(gB, 'back to 乙');
    })
    .then(function () { return press(); })
    .then(function () { return wait(1500); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      check(!isPinned(st, idB), 'the second group did not release its own card');
      notes.push('B released=' + (isPinned(st, idB) ? 1 : 0));
    })
    .catch(function (e) { fails.push('threw: ' + (e && e.message)); })
    .then(cleanup)
    .catch(function (e) { note('CLEANUP THREW ' + (e && e.message)); })
    .then(function () {
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS') + ' ' + notes.join(' '));
    });
})();
