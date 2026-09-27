/* Flips the deck's shape and leaves it there, on the second display, so a screenshot can be
   taken of whichever half you are looking at. Run it once for the pill, again for the stack. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[S] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  Promise.resolve(API.setDeckMonitor(1)).catch(function () { /* single-screen machine */ })
    .then(function () { return wait(1200); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      var next = st.settings.deckShape === 'pill' ? 'stack' : 'pill';
      nd.autoTuck(false); nd.tuck(false);
      return API.op({ type: 'settings:update', patch: { deckShape: next } }).then(function () { return wait(1400); });
    })
    .then(function () {
      var r = document.getElementById('deckFace').getBoundingClientRect();
      var d = nd.dockRect();
      note('now ' + (document.body.classList.contains('deck-pill') ? 'pill' : 'stack') +
        ' face=' + Math.round(r.width) + 'x' + Math.round(r.height) +
        ' at=' + Math.round(d.left) + ',' + Math.round(d.top) + ' of ' + innerWidth + 'x' + innerHeight);
    })
    .catch(function (e) { note('ERROR ' + (e && e.message)); });
})();
