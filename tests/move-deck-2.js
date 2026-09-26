/* Nothing here asserts anything. It moves the deck to the second display and only then opens
   the task panel, which centres itself on the work area the layer is on — in that order, or the
   panel lands on the screen the user is working in. Pair it with a panel script:

     pin-tauri.exe --test-script tests/move-deck-2.js --test-script-panel tests/<panel>.js */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[M] ' + s); } catch (e) { /* no bridge */ } }
  Promise.resolve(API.setDeckMonitor(1)).then(function (r) {
    note('deck moved to the second display ' + JSON.stringify(r));
    setTimeout(function () {
      try { API.toggleDashboard(); note('panel opening'); } catch (e) { note('ERROR ' + (e && e.message)); }
    }, 1500);
  }).catch(function () {
    note('no second display; opening the panel where the deck already lives');
    try { API.toggleDashboard(); } catch (e) { /* none */ }
  });
})();
