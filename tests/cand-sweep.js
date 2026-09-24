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
  var SLOT = 2600;
  var STATES = [];
  ['blueprint', 'memphis', 'hazard'].forEach(function (st) {
    ['1', '2', '3'].forEach(function (mv) {
      STATES.push([st, mv, 'paper']);
      STATES.push([st, mv, 'ink']);
    });
  });
  var last = -1;
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
  tick();
  setInterval(tick, 240);
})();
