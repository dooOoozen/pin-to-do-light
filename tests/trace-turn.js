/* One agent turn, recorded, so the disk trace can be checked end to end.

   The state handed to Agent.run is a *copy* with its ai.base pointed at the local mock —
   Agent.run only reads state, and the only thing that leaves is the trace line the host
   appends. The user's own settings.ai (their endpoint, their model) is never written, and no
   key is involved anywhere: the mock answers to any bearer token. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[X] ' + s); } catch (e) { /* no bridge */ } }
  if (!window.Agent || !Agent.run) { note('RESULT ERROR no Agent on the panel'); return; }
  API.getState().then(function (st) {
    var s = JSON.parse(JSON.stringify(st));
    s.settings.ai = { on: true, base: 'http://127.0.0.1:8787/v1', model: 'mock' };
    note('running one turn against the mock (settings.ai in the store untouched: base=' +
      ((st.settings.ai || {}).base || '-') + ')');
    return Agent.run('下周二下午我有三个人需要面试，帮我安排好时间', s);
  }).then(function (r) {
    note('turn ' + Agent.turnOf() + ' → ' + r.kind + ' · 草稿 ' + (r.drafts || []).length +
      ' 条 · 阶段 ' + Agent.dump().slice(-6).map(function (e) { return e.stage; }).join('>'));
    note('RESULT OK');
  }).catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
