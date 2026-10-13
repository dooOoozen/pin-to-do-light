/* 停靠上边/下边时，悬停展开的卡片要竖着排而不是横着排。

   For each edge: untuck, hover the deck into 概览, then read the slots the layer computed and
   check where they landed relative to the deck box. Side edges put the column beside the deck;
   top and bottom must put it *into* the screen — every card below the deck for the top edge,
   above it for the bottom — and all of them centred on the deck's own middle line.

   Run on the second display:
     pin-tauri.exe --monitor 2 --test-script tests/spread-edge.js */
(function () {
  var API = window.API, nd = window.__nd, doc = document;
  function note(s) { try { API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var fails = [], before = null;

  function deckRect() {
    var f = doc.getElementById('deckFace');
    return f ? f.getBoundingClientRect() : null;
  }
  /* the part of the dock a pointer can actually occupy — filed away it is translated past the edge */
  function target() {
    var r = deckRect();
    if (!r) return null;
    var l = Math.max(r.left, 0), t = Math.max(r.top, 0);
    var rr = Math.min(r.right, window.innerWidth), b = Math.min(r.bottom, window.innerHeight);
    return [(l + rr) / 2, (t + b) / 2];
  }

  function settle(want, limit) {
    return wait(120).then(function () {
      if (nd.mode() === want) return true;
      if (limit <= 0) return false;
      return settle(want, limit - 1);
    });
  }

  function probe(edge) {
    var p = target();
    if (!p) { fails.push(edge + ' NO-DECK'); return Promise.resolve(); }
    nd.cursorFrame(p[0], p[1], true);
    return settle('overview', 18).then(function (got) {
      if (!got) { fails.push(edge + ' NO-OVERVIEW mode=' + nd.mode()); nd.cursorFrame(-4000, -4000, false); return; }
      return wait(450).then(function () {
        /* keep the pointer on it while reading: the auto-tuck and the departure latch both run
           off the frames, and a lapsed hover reads back as no spread at all */
        nd.cursorFrame(p[0], p[1], true);
        return wait(150);
      }).then(function () {
        var sp = nd.spread();
        var d = deckRect();
        nd.cursorFrame(-4000, -4000, false);
        if (!sp || !sp.slots || sp.slots.length < 2) {
          /* a deck that never got a spread is not a pass — the first run of this test reported
             PASS while the bottom edge produced no slots at all, because the hover had already
             lapsed by the time the read happened */
          fails.push(edge + ' NO-SPREAD ' + (sp ? sp.slots.length : 'null'));
          note(edge + ' slots=' + (sp ? sp.slots.length : 'none'));
          return;
        }
        var xs = sp.slots.map(function (s) { return s.x; });
        var ys = sp.slots.map(function (s) { return s.y; });
        var xSpread = Math.max.apply(null, xs) - Math.min.apply(null, xs);
        var ySpread = Math.max.apply(null, ys) - Math.min.apply(null, ys);
        var line = edge + ' n=' + sp.slots.length +
          ' x-spread=' + Math.round(xSpread) + ' y-spread=' + Math.round(ySpread) +
          ' deck=' + Math.round(d.left) + ',' + Math.round(d.top) + ' ' + Math.round(d.width) + 'x' + Math.round(d.height);
        note(line);
        var verticalEdge = edge === 'left' || edge === 'right';
        /* the column runs down the screen in every case; what changes is where the cards sit */
        if (ySpread < 8) fails.push(edge + ' NOT-STACKED y=' + Math.round(ySpread));
        if (verticalEdge) {
          /* side edges align the cards' inner edge on the deck, so their centres step by half the
             width difference — a staircase, not drift. It must stay small. */
          if (xSpread > 60) fails.push(edge + ' COLUMN-DRIFTS x=' + Math.round(xSpread));
        } else {
          if (xSpread > 8) fails.push(edge + ' NOT-CENTRED x=' + Math.round(xSpread));
          var below = sp.slots.every(function (s) { return s.y - s.h / 2 >= d.bottom - 2; });
          var above = sp.slots.every(function (s) { return s.y + s.h / 2 <= d.top + 2; });
          var want = edge === 'top' ? below : above;
          if (!want) fails.push(edge + ' CARDS-NOT-INTO-SCREEN');
        }
      });
    });
  }

  Promise.resolve().then(function () { return API.getState(); })
    .then(function (st) {
      before = st.settings.edge;
      note('start edge=' + before + ' cards=' + (st.todos || []).length);
      nd.autoTuck(false);
      var chain = Promise.resolve();
      ['left', 'right', 'top', 'bottom'].forEach(function (e) {
        chain = chain.then(function () {
          return API.op({ type: 'settings:update', patch: { edge: e } }).then(function () { return wait(700); });
        }).then(function () {
          nd.tuck(false);
          return wait(260);
        }).then(function () { return probe(e); });
      });
      return chain;
    })
    .then(function () {
      return API.op({ type: 'settings:update', patch: { edge: before } }).then(function () { return wait(400); });
    })
    .then(function () { note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS') + ' (edge restored to ' + before + ')'); })
    .catch(function (e) {
      if (before) API.op({ type: 'settings:update', patch: { edge: before } });
      note('RESULT ERROR ' + (e && e.message));
    });
})();
