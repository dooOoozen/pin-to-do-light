/* Why does the pill insist on being 316 wide, and why is nothing under its own buttons?
   Print every box in the chain — window, dock, deck, face, the two flex lines and each
   control — as the browser actually laid them out. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[R] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function box(n) {
    if (!n) return 'missing';
    var r = n.getBoundingClientRect(), cs = getComputedStyle(n);
    return Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top) +
      ' display=' + cs.display + ' flex=' + cs.flex + ' flow=' + cs.flexFlow + ' w=' + cs.width +
      ' ov=' + (n.offsetParent ? n.offsetParent.className || n.offsetParent.id : '-');
  }
  Promise.resolve(API.setDeckMonitor(1)).catch(function () { /* none */ })
    .then(function () { return API.getState(); })
    .then(function (st) {
      if (st.settings.deckShape !== 'pill') return API.op({ type: 'settings:update', patch: { deckShape: 'pill' } });
    })
    .then(function () { nd.tuck(false); return wait(1400); })
    .then(function () {
      note('window=' + innerWidth + 'x' + innerHeight + ' shape=' + (document.body.classList.contains('deck-pill') ? 'pill' : 'stack'));
      note('dock  ' + box(document.getElementById('dock')));
      note('deck  ' + box(document.getElementById('deckStack')));
      note('face  ' + box(document.getElementById('deckFace')));
      note('head  ' + box(document.querySelector('.deck-head')));
      note('count ' + box(document.getElementById('deckCount')));
      note('tools ' + box(document.getElementById('dockTools')));
      Array.prototype.forEach.call(document.querySelectorAll('.dock-tools .tool'), function (b) {
        var r = b.getBoundingClientRect();
        var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        note('  ' + (b.dataset.act || '?') + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) +
          '@' + Math.round(r.left) + ',' + Math.round(r.top) +
          ' hit=' + (hit ? (hit.id || hit.className || hit.tagName) : 'NULL'));
      });
      note('simple ' + box(document.getElementById('toolSimple')));
      note('chips  ' + box(document.getElementById('groupChips')));
    })
    .catch(function (e) { note('ERROR ' + (e && e.message)); });
})();
