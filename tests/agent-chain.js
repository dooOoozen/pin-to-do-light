/* The whole agent chain, against the mock provider — no key, no cloud, no cost.
   What has to hold, in order, and each one a separate number:
     1. running the loop writes NOTHING. Drafts are data; the store is untouched until the
        confirmation step, which is the entire safety property of the design.
     2. the model's surface forms become real timestamps through the local parser — and the
        mock deliberately says "下周二" rather than a date, so if the resolution is wrong the
        bug is in our code, not in a model's arithmetic.
     3. three drafts that all ask for 14:00 come out staggered, not stacked.
     4. a missing slot comes back as a question with options, not as an invented time.
     5. a provider that answers in prose (no tool call, the case Ollama's tool_choice-less
        endpoint can produce) falls back to the local parser instead of showing chat text.
     6. commit writes exactly the drafts, and the cleanup removes exactly them.
   Start tools/mock-llm.js on 127.0.0.1:8787 first. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[A] ' + s); } catch (e) { /* no bridge */ } }
  function brief(e) { return String((e && e.message) || e).slice(0, 140); }
  function fresh() { return API.getState(); }
  function todos(st) { return st.todos || []; }
  var wasAi = null, created = [], n0 = null;

  function fmt(iso) {
    if (!iso) return 'null';
    var d = new Date(iso);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + ' ' + ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  }

  setTimeout(function () {
    fresh().then(function (st) {
      wasAi = JSON.parse(JSON.stringify(st.settings.ai || { on: false, base: '', model: '' }));
      n0 = todos(st).length;
      note('before ai=' + JSON.stringify(wasAi) + ' todos=' + n0);
      return API.aiKeySave('sk-mock-key-for-the-test-only');
    }).then(function (h) {
      note('key=' + h);
      return API.op({ type: 'settings:update', patch: { ai: {
        on: true, base: 'http://127.0.0.1:8787/v1', model: 'mock' } } });
    }).then(function () { return fresh(); }).then(function (st) {
      note('enabled on=' + st.settings.ai.on + ' base=' + st.settings.ai.base + ' model=' + st.settings.ai.model);
      return window.Agent.run('下周二下午我有三个人需要面试，帮我安排好时间', st);
    }).then(function (r) {
      note('run1 kind=' + r.kind + ' drafts=' + r.drafts.length + ' reason=' + (r.reason || ''));
      r.drafts.forEach(function (d, i) {
        note('  draft' + i + ' 「' + d.title + '」 said=' + JSON.stringify(d.said) + ' → ' + fmt(d.dueAt) +
          (d.moved ? ' (moved +' + d.moved + 'min)' : '') + ' group=' + d.groupId + ' prio=' + d.priority);
      });
      return fresh();
    }).then(function (st) {
      /* the safety property, as a number: running the loop must not touch the store, so the
         count after has to equal the count captured before — not some assumed zero */
      note('afterRun todos=' + todos(st).length + ' of ' + n0 +
        ' wroteNothing=' + (todos(st).length === n0));
      return window.Agent.run('下周三提醒我交报告', st);
    }).then(function (r) {
      note('run2(kind) kind=' + r.kind + ' q=' + (r.question || '') + ' options=' + (r.options || []).join('/'));
      return fresh().then(function (st) { return window.Agent.run('随便说点什么', st); });
    }).then(function (r) {
      note('run3(no-tool-call) kind=' + r.kind + ' drafts=' + r.drafts.length +
        ' reason=' + (r.reason || '') + (r.drafts[0] ? ' → ' + fmt(r.drafts[0].dueAt) : ''));
      /* now the one step that is allowed to write */
      return fresh().then(function (st) { return window.Agent.run('下周二下午我有三个人需要面试，帮我安排好时间', st); });
    }).then(function (r) {
      return window.Agent.commit(r, []).then(function (n) { note('commit added=' + n.added + ' changed=' + n.changed); });
    }).then(function () { return fresh(); }).then(function (st) {
      created = todos(st).filter(function (t) { return /^面试 候选人/.test(t.title); });
      note('stored=' + todos(st).length + ' mine=' + created.length +
        ' times=' + created.map(function (t) { return fmt(t.dueAt); }).join(' | '));
      var days = {};
      created.forEach(function (t) { if (t.dueAt) days[new Date(t.dueAt).getDay()] = 1; });
      note('allTuesday=' + (Object.keys(days).join('') === '2'));
      created.forEach(function (t) { note('  ' + t.title + ' · ' + t.priority + ' · ' + t.groupId); });
      return Promise.all(created.map(function (t) { return API.op({ type: 'todo:delete', id: t.id }); }));
    }).then(function () { return fresh(); }).then(function (st) {
      note('cleanup todos=' + todos(st).length);
      return API.op({ type: 'settings:update', patch: { ai: wasAi } });
    }).then(function () { return API.aiKeyClear(); }).then(function (h) {
      note('restored ai + key=' + h);
      var tr = window.Agent.dump();
      note('trace=' + tr.length + ' stages=' + tr.map(function (t) { return t.stage; }).join(','));
    }).catch(function (e) { note('ERR ' + brief(e)); });
  }, 1500);
})();
