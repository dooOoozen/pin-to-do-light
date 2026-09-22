/* A fast material walk for the recorder: material-hold.js holds each one for twenty
   seconds so the outside-in tools can measure it, which is far too slow for a clip. This
   spends about 1.1 s per material across all six, then the night half of three, and puts
   the user's own setting back at the end. Run with --test-script-panel. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[M] ' + s); } catch (e) { /* no bridge */ } }
  var STEP = 2300;

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function visit(style, hour) {
    return API.op({ type: 'settings:update', patch: { style: style, theme: hour } })
      .then(function () { return wait(STEP); });
  }

  API.getState().then(function (st) {
    var before = { style: st.settings.style, theme: st.settings.theme };
    var chain = Promise.resolve();
    ['print', 'diner', 'ikb', 'garden', 'poster', 'console'].forEach(function (s) {
      chain = chain.then(function () { return visit(s, 'paper'); });
    });
    ['garden', 'poster', 'console'].forEach(function (s) {
      chain = chain.then(function () { return visit(s, 'ink'); });
    });
    chain.then(function () { return visit(before.style, before.theme); })
      .then(function () { note('morph done, restored ' + before.style + '/' + before.theme); });
  });
})();
