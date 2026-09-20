/* Put the dashboard back on the default arrangement. The layout test drags modules
   around and cycles spans, and that is a preference the user sets, not the harness. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[R] ' + s); } catch (e) { /* no bridge */ } }
  API.op({
    type: 'settings:update',
    patch: {
      dashLayout: {
        order: ['clock', 'stats', 'pomo', 'today', 'memo', 'heat', 'mini'],
        span: { clock: 2, stats: 4, pomo: 2, today: 2, memo: 2, heat: 3, mini: 3 }
      }
    }
  }).then(function () {
    return API.getState();
  }).then(function (st) {
    var dl = st.settings.dashLayout || {};
    note('reset order=' + (dl.order || []).join(',') + ' memo=' + (dl.span || {}).memo +
      ' stats=' + (dl.span || {}).stats);
  });
})();
