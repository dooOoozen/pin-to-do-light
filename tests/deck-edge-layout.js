/* 卡盒靠左/靠上时，DECK 标题条和数量到底落在哪儿。

   Reads the boxes, not the intent: for each edge it takes the rect of the band, the number and
   the tool row relative to the face, and asserts the two things that were reported as still
   wrong — on the left edge the band and the number sit at the far side of the face (the side the
   cards come out of), and on the top edge the tool row is above them rather than below.

   Run on the second display:
     pin-tauri.exe --monitor 2 --test-script tests/deck-edge-layout.js */
(function () {
  var API = window.API, doc = document;
  function note(s) { try { API.bootNote('[E] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var fails = [], before = null;

  function r(sel) { var n = doc.querySelector(sel); return n ? n.getBoundingClientRect() : null; }

  function probe(edge) {
    var face = doc.getElementById('deckFace');
    if (!face) { fails.push(edge + ' NO-FACE'); return Promise.resolve(); }
    var f = face.getBoundingClientRect();
    var head = r('.deck-head'), count = r('.deck-count'), tools = r('.dock-tools');
    var chips = r('.group-chips'), deck = r('.deck');
    if (!head || !count || !tools) { fails.push(edge + ' MISSING-PART'); return Promise.resolve(); }
    var bandL = Math.min(head.left, count.left) - f.left;
    var bandR = Math.max(head.right, count.right) - f.left;
    var bandMid = (bandL + bandR) / 2, faceMid = f.width / 2;
    var line = edge +
      ' face=' + Math.round(f.width) + 'x' + Math.round(f.height) +
      ' band=' + Math.round(bandL) + '-' + Math.round(bandR) + '/' + Math.round(faceMid) +
      ' head.y' + Math.round(head.top - f.top) + ' tools.y' + Math.round(tools.top - f.top) +
      ' chips=' + (chips && deck ? (Math.abs(chips.top - deck.bottom) < 14 ? 'below'
        : Math.abs(deck.top - chips.bottom) < 14 ? 'above' : 'beside') : '?') +
      ' dir=' + getComputedStyle(face).flexDirection +
      ' shape=' + (doc.body.classList.contains('deck-pill') ? 'pill' : 'stack');
    note(line);
    if (edge === 'left') {
      /* the band and the number share one group; on the left edge its middle has to sit on the
         right half of the face, which is the side the cards and chips come out of */
      if (bandMid <= faceMid) fails.push('left BAND-NOT-RIGHT-ALIGNED mid=' + Math.round(bandMid) + '/' + Math.round(faceMid));
    }
    if (edge === 'right') {
      if (bandMid >= faceMid) fails.push('right BAND-MOVED ' + Math.round(bandMid) + '/' + Math.round(faceMid));
    }
    if (edge === 'top') {
      if (tools.top > head.top) fails.push('top TOOLS-NOT-ABOVE-BAND');
    } else if (edge === 'bottom') {
      if (tools.top < head.bottom) fails.push('bottom BAND-NOT-ABOVE-TOOLS');
    }
    return Promise.resolve();
  }

  Promise.resolve().then(function () { return API.getState(); })
    .then(function (st) {
      before = st.settings.edge;
      note('start edge=' + before);
      var chain = Promise.resolve();
      ['left', 'right', 'top', 'bottom'].forEach(function (e) {
        chain = chain.then(function () {
          return API.op({ type: 'settings:update', patch: { edge: e } }).then(function () { return wait(650); });
        }).then(function () { return probe(e); });
      });
      return chain;
    })
    .then(function () { return API.op({ type: 'settings:update', patch: { edge: before } }); })
    .then(function () { note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS') + ' (edge restored)'); })
    .catch(function (e) {
      if (before) API.op({ type: 'settings:update', patch: { edge: before } });
      note('RESULT ERROR ' + (e && e.message));
    });
})();
