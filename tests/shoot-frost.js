/* Re-shoot the two FROST gallery plates. The committed ones are wrong twice over: the crop
   was placed by the CSS viewport instead of the window rect, so the left half of the frame
   caught whatever else was on the second display, and the panel itself ran off the right
   edge. So: hold one material long enough to photograph, day then night, and put back
   everything that was borrowed — the material, the theme, and the screen.

   Paired with tests/shoot-frame.js, which is the panel half (it selects the ledger view).
   The capture itself is driven from the shell against the window rect winlist.ps1 reports. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[H] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var STYLE = window.__shootStyle || 'frost';
  var before = {};
  Promise.resolve(API.setDeckMonitor(1)).catch(function () { /* single-screen machine */ })
    .then(function () { return wait(1200); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      before = { style: st.settings.style, theme: st.settings.theme };
      note('holding ' + STYLE + ' (borrowed from ' + before.style + '/' + before.theme + ')');
      return API.op({ type: 'settings:update', patch: { style: STYLE, theme: 'paper' } });
    })
    .then(function () {
      /* the panel is created on the deck's display, so move the deck first and open after */
      try { API.toggleDashboard(); } catch (e) { /* none */ }
      return wait(3000);
    })
    .then(function () { note('PHASE day'); return wait(12000); })
    .then(function () { return API.op({ type: 'settings:update', patch: { theme: 'ink' } }); })
    .then(function () { return wait(3000); })
    .then(function () { note('PHASE night'); return wait(12000); })
    .then(function () { return API.op({ type: 'settings:update', patch: before }); })
    .then(function () { note('PHASE restored ' + JSON.stringify(before)); })
    .catch(function (e) { note('ERROR ' + (e && e.message)); });
})();
