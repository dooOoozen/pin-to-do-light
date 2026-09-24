/* What does this provider actually accept? Two free calls, then one that costs.
   The user's configuration is Google's `/v1beta`, which is the *native* Gemini API — a
   different JSON dialect from OpenAI — while the agent speaks OpenAI. So the first two
   probes list models at both URLs (free, no tokens) and the shape of the answer says which
   one the agent can use. Only then does a single completion go out, aimed at the model the
   user actually chose, because "does my model do function calling" is the question that
   decides whether the ✨ works at all — and if the name is not even in the list, say so
   instead of spending a call on a 404. */
(function () {
  var API = window.API, A = window.Agent;
  function note(s) { try { API.bootNote('[X] ' + s); } catch (e) { /* no bridge */ } }
  var BASE = 'https://generativelanguage.googleapis.com/v1beta';
  var want = null;

  setTimeout(function () {
    API.getState().then(function (st) {
      want = (st.settings.ai || {}).model || '';
      note('configured model=' + JSON.stringify(want));
      return A.probe(BASE);
    }).then(function (p) {
      note('native  ok=' + p.ok + ' shape=' + p.shape + ' count=' + p.models.length +
        ' hint=' + p.hint);
      note('native sample=' + p.models.slice(0, 14).join(' '));
      return A.probe(BASE + '/openai');
    }).then(function (p) {
      note('openai  ok=' + p.ok + ' shape=' + p.shape + ' count=' + p.models.length +
        ' hint=' + p.hint);
      note('openai sample=' + p.models.slice(0, 14).join(' '));
      var list = p.models || [];
      var mine = list.filter(function (m) { return m === want || ('models/' + m) === want; })[0];
      if (!mine) {
        note('the configured model is NOT in the list — no call made, nothing spent');
        return { ok: false, skipped: true };
      }
      note('one call out to ' + mine);
      return A.tryCall(BASE + '/openai', mine);
    }).then(function (r) {
      if (r.skipped) { note('done (skipped)'); return; }
      note('tryCall ok=' + r.ok + ' toolCalling=' + r.toolCalling + ' ms=' + r.ms +
        ' tokens=' + (r.tokens || 0) + ' tool=' + (r.tool || '-') +
        ' args=' + (r.args || '-') + ' content=' + JSON.stringify(r.content || r.error || ''));
    }).catch(function (e) { note('ERR ' + String((e && e.message) || e).slice(0, 200)); });
  }, 1500);
})();
