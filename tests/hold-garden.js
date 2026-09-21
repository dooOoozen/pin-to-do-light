/* Pins one material and leaves it there, so the outside-in tools — the screen recorder,
   the ramp scanner, the screenshotter — can work on a surface they know the identity of.
   material-hold.js walks all of them and restores the user's setting; this one does not,
   because its whole purpose is a stable frame. Run with:
     --test-script-panel tests/hold-garden.js
*/
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[X] ' + s); } catch (e) { /* no bridge */ } }
  API.op({ type: 'settings:update', patch: { style: 'garden', theme: 'paper' } })
    .then(function () { return API.getState(); })
    .then(function (st) { note('holding ' + st.settings.style + '/' + st.settings.theme); });
})();
