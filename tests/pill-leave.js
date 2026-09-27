/* The live reports that killed the first two attempts, as assertions:
   1. 常态下仍然是卡片堆 — the deck filed itself away (auto-tuck fires 600 ms after the pointer
      leaves, which beat every capsule timer), so the pill never got to be the resting state.
      The resting state now has to be the pill and stay the pill for seconds.
   2. 鼠标移动上去时变成卡片堆 — arriving must open the full deck.
   3. 有时候先变胶囊再变卡片堆 — an arm that lands under an inbound pointer must be withdrawn,
      not shown for a frame.
   4. 悬停卡片也一并叠在上面 — the chips are laid out from the deck box, so if the spread is
      computed while the box is still pill-sized every card lands on the deck. Measured as the
      overlap between each spread card and the deck, which must be zero once things settle.

   The real cursor feed is switched off so only these frames move the state, and each frame
   goes through updateHover the way a feed frame does. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[L] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function pill() { return document.body.classList.contains('deck-capsule'); }
  function rect(el) {
    var r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  }
  function centre() { var d = nd.dockRect(); return { x: (d.left + d.right) / 2, y: (d.top + d.bottom) / 2 }; }
  function worstOverlap() {
    var d = nd.dockRect(), best = 0, who = '';
    Array.prototype.forEach.call(document.querySelectorAll('.todo-card'), function (c) {
      if (c.classList.contains('docked')) return;
      var r = rect(c);
      var w = Math.max(0, Math.min(r.r, d.right) - Math.max(r.l, d.left));
      var h = Math.max(0, Math.min(r.b, d.bottom) - Math.max(r.t, d.top));
      if (w * h > best) { best = w * h; who = c.dataset.id || '?'; }
    });
    return { px: Math.round(best), who: who };
  }
  var bad = [];
  function look(tag, wantPill, wantTuck, midFlight) {
    var got = pill(), hi = nd.hoverInfo(), o = worstOverlap();
    var line = tag + ' pill=' + (got ? 'ON' : 'off') + ' want=' + (wantPill ? 'ON' : 'off') +
      ' tucked=' + hi.tucked + ' mode=' + nd.mode() +
      ' deck=' + Math.round(d0().right - d0().left) + 'x' + Math.round(d0().bottom - d0().top) +
      ' cardOverDeck=' + o.px + (o.px ? '(' + o.who + ')' : '');
    if (got !== wantPill) bad.push(tag + ' pill');
    if (wantTuck !== undefined && hi.tucked !== wantTuck) bad.push(tag + ' tucked');
    if (o.px > 0 && !midFlight) bad.push(tag + ' chips over the deck');
    note(line);
  }
  function d0() { return nd.dockRect(); }
  nd.cursorFeed(false);
  Promise.resolve(API.setDeckMonitor(1)).catch(function () { /* single-screen machine */ })
    .then(function () { return wait(1400); })
    .then(function () { nd.cursorCmd(60, 60, true); return wait(2600); })
    .then(function () { look('resting after boot', true, false); return wait(3000); })
    .then(function () { look('still resting 3s later', true, false); })
    .then(function () { var c = centre(); nd.cursorCmd(c.x, c.y, true); return wait(240); })
    /* the chips are still flying at 240 ms, so only the pill state is asserted here */
    .then(function () { look('pointer arriving', false, false, true); return wait(900); })
    .then(function () { look('deck open under the pointer', false, false); })
    .then(function () { nd.cursorCmd(60, 60, true); return wait(2600); })
    .then(function () { look('pointer walked away', true, false); return wait(3000); })
    .then(function () {
      look('and stays a pill', true, false);
      nd.cursorFeed(true);
      note('RESULT ' + (bad.length ? 'FAIL ' + bad.join(' | ') : 'PASS pill rests, deck opens on arrival, no chips on the box'));
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
