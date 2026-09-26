/* Hold one material long enough to photograph it for the README gallery, then put back what
   was borrowed: the material, the hour and the screen. The layer half, driving the state.

   The layer owns the writes because `API.getState()` resolves there and does not resolve on a
   panel that is still booting — which is what made the first version of this note nothing at
   all while the shutter fired. It also moves the deck to the second display before the panel
   is created, because the panel is centred on the work area it finds and a gallery capture
   has no business happening on the screen the user is working on. The panel side, which only
   switches to 仪表盘 and reports its rect, lives in hold-frame.js. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var STYLE = window.__holdStyle || 'frost';

  var before = {};
  if (API.setDeckMonitor) {
    Promise.resolve(API.setDeckMonitor(1)).then(function () {
      setTimeout(function () { try { API.toggleDashboard(); } catch (e) { /* none */ } }, 1500);
    }).catch(function () { /* single-screen machine */ });
  }
  API.getState().then(function (st) {
    before = { style: st.settings.style, theme: st.settings.theme };
    note('holding ' + STYLE + ' (was ' + before.style + '/' + before.theme + ')');
    return API.op({ type: 'settings:update', patch: { style: STYLE, theme: 'paper' } });
  }).then(function () { return wait(4200); }).then(function () {
    note('day held, switching to night');
    return API.op({ type: 'settings:update', patch: { theme: 'ink' } });
  }).then(function () { return wait(4200); }).then(function () {
    return API.op({ type: 'settings:update', patch: { style: before.style, theme: before.theme } });
  }).then(function () {
    note('restored ' + before.style + '/' + before.theme);
  }).catch(function (e) { note('ERROR ' + (e && e.message)); });
})();
