/* Candidate materials, driven on the wall clock so the card layer and the task panel show
   the same thing at the same moment without talking to each other: both pages compute the
   slot index from Date.now(), so a screenshotter only has to wait for the next change.

   `data-style` is set on the document directly rather than through settings, because
   `styleKey()` clamps an unregistered key back to 'print' — which is the correct behaviour
   for a saved state and the wrong one for a preview. Nothing here persists: closing the app
   leaves the user's real material untouched. theme-apply rewrites the attribute on any state
   change, so the assertion is repeated; a stray save cannot leave the wrong material up. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  var SLOT = 3200;
  var STATES = [];
  /* poster mv1 is the material as it stands today, so the pick has something to be
     compared against; chrome is the new material in three readings */
  [['poster', ['1', '2', '3', '4']], ['chrome', ['1', '2', '3']]].forEach(function (pair) {
    pair[1].forEach(function (mv) {
      STATES.push([pair[0], mv, 'paper']);
      STATES.push([pair[0], mv, 'ink']);
    });
  });
  var last = -1;
  /* the deck lives where the user chose it, and the --monitor flag no longer overrides a
     setting they made on purpose, so a preview run has to move it explicitly and open the
     panel only afterwards — the panel is centred on the work area it finds, and that has to
     be the second screen or the screenshots land on the working display */
  if (API.setDeckMonitor) {
    Promise.resolve(API.setDeckMonitor(1)).then(function () {
      setTimeout(function () { try { API.toggleDashboard(); } catch (e) { /* no panel */ } }, 1600);
    }).catch(function () { /* single-screen machine */ });
  }
  /* the layer half of the sheet is the deck with its chips out: a tucked deck shows one
     edge of the material and a spread shows the card, the head bar and the index mark */
  var nd = window.__nd;
  if (nd) {
    nd.autoTuck(false);
    nd.tuck(false);
    setInterval(function () {
      var d = nd.dockRect();
      if (d) nd.cursorCmd((d.left + d.right) / 2, (d.top + d.bottom) / 2, true);
    }, 300);
  }

  function tick() {
    var i = Math.floor(Date.now() / SLOT) % STATES.length;
    var s = STATES[i];
    var root = document.documentElement;
    root.dataset.style = s[0];
    root.dataset.mv = s[1];
    root.dataset.theme = s[2];
    if (i !== last) {
      last = i;
      note(i + ' ' + s[0] + '/' + s[1] + '/' + s[2]);
    }
  }
  /* every frame, not every 240 ms: the dashboard rewrites data-style from settings on its
     own clock, and a slower assertion means the panel renders the user's saved material
     while the sweep measures the candidate it set a frame earlier — the numbers were right
     and the pixels were wrong */
  (function loop() { tick(); requestAnimationFrame(loop); })();
})();
