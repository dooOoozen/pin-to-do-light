/* Holds the deck open while the material is switched, so a screenshot shows the cards
   themselves in the new style. Puts everything back on the way out. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[Z] ' + s); } catch (e) { /* no bridge */ } }
  var dock = document.getElementById('dock');
  var back = null;

  API.getState().then(function (st) {
    back = { style: st.settings.style, theme: st.settings.theme };
    return API.op({ type: 'settings:update', patch: { style: 'diner', theme: 'paper' } });
  }).then(function () {
    nd.autoTuck(false);
    var n = 0;
    var iv = setInterval(function () {
      var r = dock.getBoundingClientRect();
      n++;
      nd.cursorFrame(r.left + r.width / 2 + (n % 2 ? 5 : -5), r.top + r.height / 2, true);
      if (n === 14) note('held open mode=' + nd.mode() + ' cards=' + document.querySelectorAll('.todo-card:not(.docked)').length);
      if (n < 40) return;
      clearInterval(iv);
      API.op({ type: 'settings:update', patch: { style: back.style, theme: back.theme } }).then(function () {
        note('restored ' + back.style + '/' + back.theme);
      });
    }, 200);
  });
})();
