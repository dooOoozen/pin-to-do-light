/* Shoot every material plate, day and night, for the README gallery — with whatever is in the
   task list at the time, which is why the store is swapped to a demo board before this runs
   and put back byte-for-byte after.

   The layer half: move to the second display, open the panel, then for each material hold it
   long enough to photograph. Each hold announces itself in the log and the shell polls for
   that marker instead of guessing at timings — a capture that fires half a second early
   photographs the *previous* material and still looks plausible, which is the worst kind of
   wrong. Everything borrowed is put back at the end.

   Paired with tests/shoot-frame.js (the panel selects the ledger view) and
   tools/shoot-plates.sh, which does the cropping against the real window rect. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[S] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var PLATES = [
    ['print', 'paper'], ['diner', 'paper'], ['ikb', 'paper'],
    ['garden', 'paper'], ['frost', 'paper'], ['console', 'paper'],
    ['garden', 'ink'], ['frost', 'ink'], ['console', 'ink'],
    ['print', 'ink'], ['diner', 'ink'], ['ikb', 'ink']
  ];
  var before = {};
  Promise.resolve(API.setDeckMonitor(1)).catch(function () { /* single-screen machine */ })
    .then(function () { return wait(1200); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      before = { style: st.settings.style, theme: st.settings.theme };
      note('begin (borrowed ' + before.style + '/' + before.theme + ')');
      try { API.toggleDashboard(); } catch (e) { /* already open */ }
      return wait(3200);
    })
    .then(function () {
      var chain = Promise.resolve();
      PLATES.forEach(function (p) {
        chain = chain.then(function () {
          return API.op({ type: 'settings:update', patch: { style: p[0], theme: p[1] } });
        }).then(function () { return wait(1500); })
          .then(function () { note('PLATE ' + p[0] + ' ' + p[1]); return wait(3400); });
      });
      return chain;
    })
    .then(function () { return API.op({ type: 'settings:update', patch: before }); })
    .then(function () { note('DONE restored ' + JSON.stringify(before)); })
    .catch(function (e) { note('ERROR ' + (e && e.message)); });
})();
