/* Card-layer side: a task pinned from the ledger has to appear on the desk, keep its
   place when the deck shows a different group, and go away when it is called back. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[K] ' + s); } catch (e) { /* no bridge */ } }
  function qa(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function cardOf(id) { return qa('.todo-card').filter(function (c) { return c.dataset.id === id; })[0]; }
  function spot(c) {
    if (!c) return '-';
    var s = c.style;
    return (s.getPropertyValue('--tx') || '0') + '/' + (s.getPropertyValue('--ty') || '0') +
      ' cw=' + (s.getPropertyValue('--cw') || '-');
  }

  var startGroup = null;
  var hadPlacement = false;

  setTimeout(function () {
    API.getState().then(function (st) {
      var act = st.settings.activeGroupId;
      startGroup = act;
      var pick = st.todos.filter(function (t) {
        /* the user may already have cards out on the desk: do not disturb those */
        return t.groupId !== act && !t.done && !((st.placements || {})[t.id] || {}).pinned;
      });
      var t = pick[0];
      if (!t) { note('FAIL no off-group task'); return; }
      hadPlacement = !!(st.placements || {})[t.id];
      note('before cards=' + qa('.todo-card').length + ' active=' + act +
        ' target=' + t.id + ' of group ' + t.groupId + ' hadPlacement=' + hadPlacement);
      API.op({ type: 'todo:deploy', id: t.id }).then(function (res) {
        note('deploy pinned=' + (res && res.pinned));
        waitCard(t, act, 0);
      });
    });
  }, 400);

  function waitCard(t, act, tries) {
    var c = cardOf(t.id);
    if (c) {
      setTimeout(function () { settled(t, act, c); }, 700);
      return;
    }
    if (tries > 12) { note('FAIL card never appeared'); return; }
    setTimeout(function () { waitCard(t, act, tries + 1); }, 250);
  }

  function settled(t, act, c) {
    note('on desk cls=' + c.className + ' spot=' + spot(c) +
      ' group=' + (document.querySelector('.todo-card[data-id="' + t.id + '"] .card-group') || { textContent: '-' }).textContent.trim());
    /* the layer places the card itself and writes the spot back once */
    API.getState().then(function (st) {
      var p = st.placements[t.id];
      note('placement x=' + Math.round(p.x) + ' y=' + Math.round(p.y) + ' pinned=' + p.pinned);
      var other = st.groups.filter(function (g) { return g.id !== act && g.id !== t.groupId; })[0] ||
        st.groups.filter(function (g) { return g.id !== act; })[0];
      if (!other) { note('FAIL no third group to switch to'); return; }
      API.op({ type: 'settings:update', patch: { activeGroupId: other.id } });
      setTimeout(function () {
        var still = cardOf(t.id);
        var own = qa('.todo-card').filter(function (x) {
          return x.dataset.id !== t.id;
        }).length;
        note('after switch to ' + other.id + ' card=' + !!still + ' spot=' + spot(still) +
          ' otherCards=' + own + ' (the deck now shows another group)');
        recall(t, still);
      }, 1400);
    });
  }

  function recall(t, before) {
    API.op({ type: 'todo:deploy', id: t.id }).then(function (res) {
      setTimeout(function () {
        var gone = !cardOf(t.id);
        note('recall pinned=' + (res && res.pinned) + ' cardGone=' + gone +
          ' wasSpot=' + spot(before));
        API.getState().then(function (st) {
          note('placement after recall pinned=' + !!(st.placements[t.id] || {}).pinned);
          /* the desk is only tidy if the spot we invented is thrown away too */
          if (!hadPlacement && st.placements[t.id]) {
            return API.op({ type: 'placement:delete', todoId: t.id }).then(function () {
              API.getState().then(function (st0) {
                note('spot deleted=' + !st0.placements[t.id]);
              });
            });
          }
          return null;
        }).then(function () {
          /* the deck was moved for the test; put it back where the user left it */
          return API.op({ type: 'settings:update', patch: { activeGroupId: startGroup } });
        }).then(function () {
          setTimeout(function () {
            API.getState().then(function (st2) {
              note('activeGroup restored=' + st2.settings.activeGroupId +
                ' cards=' + qa('.todo-card').length);
            });
          }, 700);
        });
      }, 1200);
    });
  }
})();
