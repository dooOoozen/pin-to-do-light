/* The band has to be answered without taking pixels away from the cards, so this is the run
   that says whether the new answer holds. Two questions, both about frames rather than state:

     1. does a white caption strip appear while the layer holds the keyboard — quick add by
        double-clicking the deck face (the user's own repro) and the full 新建任务 modal, twice
        each, because the first activation is the one that composes the surface;
     2. does anything that reaches the top of the screen keep its head — the deck moved to
        edge=top and then scattered, which is the case the region clip used to eat.

   Everything here is a timestamp note so the recorder's frames can be matched to a phase. The
   pixel verdict is read off the frames, not off this file; what this file adds is the object
   model beside them (mode, focus, and `nd.lag()`, which tests every painted corner against the
   spans actually handed to SetWindowRgn). */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[G] ' + s); } catch (e) { /* no bridge */ } }
  function q(sel) { return document.querySelector(sel); }
  function at(ms, fn) { setTimeout(fn, ms); }
  function dbl(node) {
    ['mousedown', 'mouseup', 'click', 'mousedown', 'mouseup', 'click', 'dblclick'].forEach(function (t) {
      node.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    });
  }
  function click(node) {
    ['mousedown', 'mouseup', 'click'].forEach(function (t) {
      node.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    });
  }
  function face() { return q('#deckFace'); }
  function closeBtn() { return q('[data-act="close"]'); }

  function paintTop(tag) {
    var top = Infinity, who = '';
    /* the deck has to be OUT on screen for any of this to be on the pixels: with the
       auto-tuck still live the whole run happened against a dock filed off the edge */
    nd.tuck(false);
    Array.prototype.forEach.call(document.querySelectorAll('.todo-card'), function (c) {
      var cs = getComputedStyle(c);
      if (!c.offsetWidth || cs.opacity === '0' || cs.visibility === 'hidden') return;
      var b = c.getBoundingClientRect();
      if (b.top < top) { top = b.top; who = '"' + ((q('.card-title', c) || {}).textContent || '').slice(0, 6) + '"'; }
    });
    var d = nd.dockRect();
    note(tag + ' t=' + Date.now() + ' mode=' + nd.mode() + ' tucked=' + nd.hoverInfo().tucked +
      ' minCardTop=' + (top === Infinity ? 'NONE-nothing-painting' : Math.round(top)) + ' ' + who +
      ' dock=' + (d ? Math.round(d.left) + ',' + Math.round(d.top) + '..' + Math.round(d.right) + ',' + Math.round(d.bottom) : '-') +
      ' lag=' + nd.lag());
  }

  nd.autoTuck(false);
  var wasEdge = null, seedIds = [], known = [], was = {};

  /* the active group can legitimately hold nothing but finished tasks, and then the
     "scattered at the top" phase measures an empty desk and reports no clip */
  API.getState().then(function (st) {
      wasEdge = st.settings.edge;
      known = st.todos.map(function (t) { return t.id; });
      was = { cardFontScale: st.settings.cardFontScale, chipFontScale: st.settings.chipFontScale };
      /* the settings the user reports the pop with: chip text at its floor, card text at its top */
      return API.op({ type: 'settings:update', patch: { cardFontScale: 1.6, chipFontScale: 1 } });
    })
    .then(function () {
      var gid = null;
      return API.getState().then(function (st) {
        gid = st.settings.activeGroupId;
        return Promise.all([
          API.op({ type: 'todo:add', title: '白框看守 甲', groupId: gid, dueAt: null }),
          API.op({ type: 'todo:add', title: '白框看守 乙', groupId: gid, dueAt: null }),
          API.op({ type: 'todo:add', title: 'auto band guard card', groupId: gid, dueAt: null })
        ]);
      });
    })
    .then(function () {
      return API.getState();
    })
    .then(function (st) {
      seedIds = st.todos.map(function (t) { return t.id; }).filter(function (id) {
        return known.indexOf(id) < 0;
      });
      note('seeded=' + seedIds.length + ' cards=' + document.querySelectorAll('.todo-card').length);
      at(400, function () { note('T+0.4 t=' + Date.now() + ' open quick-add (dblclick face)'); dbl(face()); });
      at(2300, function () { note('T+2.3 close'); if (closeBtn()) click(closeBtn()); });
      at(3100, function () { note('T+3.1 open quick-add #2'); dbl(face()); });
      at(4600, function () { note('T+4.6 close #2'); if (closeBtn()) click(closeBtn()); });
      at(5400, function () {
        note('T+5.4 open 新建任务 modal');
        click(q('[data-act="add"]'));
      });
      at(7200, function () { note('T+7.2 close modal'); if (closeBtn()) click(closeBtn()); });
      at(8000, function () {
        note('T+8.0 edge -> top');
        nd.cursorCmd(20, 20, false);
        API.op({ type: 'settings:update', patch: { edge: 'top' } });
      });
      at(9200, function () { paintTop('T+9.2 dock at top'); });
      at(10000, function () { note('T+10.0 scatter (click face)'); click(face()); });
      at(11200, function () { paintTop('T+11.2 scattered at top'); });
      at(12800, function () { paintTop('T+12.8 scattered, settled'); });
      at(14000, function () {
        note('T+14.0 restore edge=' + wasEdge);
        click(face());
        API.op({ type: 'settings:update', patch: { edge: wasEdge } });
      });
      at(15200, function () {
        paintTop('T+15.2 restored');
        var chip = q('.todo-card .card-title');
        note('chip font now=' + (chip ? getComputedStyle(chip).fontSize : '-') +
          ' cs=' + getComputedStyle(document.body).getPropertyValue('--cs').trim() +
          ' chipk=' + getComputedStyle(document.body).getPropertyValue('--chipk').trim() +
          ' fontk=' + getComputedStyle(document.body).getPropertyValue('--fontk').trim());
        return Promise.all(seedIds.map(function (id) { return API.op({ type: 'todo:delete', id: id }); }))
          .then(function () {
            return API.op({ type: 'settings:update', patch: {
              cardFontScale: was.cardFontScale, chipFontScale: was.chipFontScale } });
          }).then(function () { note('cleanup done'); });
      });
    });
})();
