/* Holds each material in turn long enough for the outside-in tools to work — a screen
   ramp scan, a screenshot, a frame grab — and announces each hold in the boot log so the
   watcher reacts to the app rather than to a stopwatch it guessed. The point of the hold
   is that the pixel evidence and the DOM evidence are gathered from the same material:
   the first version of this rig sampled a column while the style was still the previous
   one and reported a clean ramp for a surface that was not on screen. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[H] ' + s); } catch (e) { /* no bridge */ } }
  var HOLD = 20000;

  var LIST = [];
  ['print', 'diner', 'ikb', 'garden', 'p3', 'unp'].forEach(function (s) {
    LIST.push([s, 'paper']); LIST.push([s, 'ink']);
  });

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function visit(style, hour) {
    return API.op({ type: 'settings:update', patch: { style: style, theme: hour } })
      .then(function () { return wait(400); })
      .then(function () { note('HOLD ' + style + '/' + hour); return wait(HOLD); });
  }

  API.getState().then(function (st) {
    var before = { style: st.settings.style, theme: st.settings.theme };
    note('was ' + before.style + '/' + before.theme);
    var chain = Promise.resolve();
    LIST.forEach(function (p) { chain = chain.then(function () { return visit(p[0], p[1]); }); });
    chain.then(function () { return API.op({ type: 'settings:update', patch: before }); })
      .then(function () { return wait(500); })
      .then(function () { note('DONE restored ' + before.style + '/' + before.theme); });
  });
})();
