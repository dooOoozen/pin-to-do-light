/* Cycles the material for the screenshotter and puts the setting back when it is done:
   diner by day, diner by night, then whatever the user had. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[X] ' + s); } catch (e) { /* no bridge */ } }
  var before = null;

  API.getState().then(function (st) {
    before = { style: st.settings.style, theme: st.settings.theme };
    note('was ' + before.style + '/' + before.theme);
    return API.op({ type: 'settings:update', patch: { style: 'diner', theme: 'paper' } });
  }).then(function () {
    setTimeout(function () {
      note('shot diner-day');
      return API.op({ type: 'settings:update', patch: { theme: 'ink' } });
    }, 4000);
    setTimeout(function () {
      note('shot diner-night');
      return API.op({ type: 'settings:update', patch: { style: before.style, theme: before.theme } });
    }, 9000);
    setTimeout(function () {
      API.getState().then(function (st) {
        note('restored ' + st.settings.style + '/' + st.settings.theme);
      });
    }, 10200);
  });
})();
