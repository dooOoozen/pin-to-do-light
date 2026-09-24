/* The sentence the user actually typed, against the three ways a real provider answered it.
   Reported: with a task "明天 · 面试", "明天面试推迟到后天" produced a NEW task titled
   "明天面试推迟到" instead of moving the old one.

   The log showed three separate ways to arrive at that, and the app has to survive all three,
   because none of them is a reason to hand somebody a duplicate of their own appointment:
     1. the model writes the call into the prose in its own markup — read it back (方言)
     2. the model picks suggest_tasks for a sentence that edits one task — refile it (选错)
     3. the model only talks and the router 500s — decline, do not let the local parser invent
        a task from a command (只会聊天)
   Each scenario asserts against the store: the seeded task's day, and the total number of
   tasks, which is the one that catches a duplicate. Everything it creates is deleted, and the
   AI settings and credential are left exactly as found. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[U] ' + s); } catch (e) { /* no bridge */ } }
  function q(sel) { return document.querySelector(sel); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function p(n) { return (n < 10 ? '0' : '') + n; }
  function at(iso) {
    if (!iso) return '无日期';
    var d = new Date(iso);
    return d.getMonth() + 1 + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function localIso(offset, h) {
    var d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(h, 0, 0, 0);
    return d.toISOString();
  }
  function dayOf(iso) {
    if (!iso) return -99;
    var d = new Date(iso), t = new Date();
    t.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - t.getTime()) / 864e5);
  }

  var seedId = null, n0 = 0, savedAi = null, madeKey = false;

  /* one sentence, driven the way a person drives it, ending in what the store says. The count
     is measured across this scenario alone: the app has one live store and the person may be
     adding to it while the test runs, so an absolute number would blame the test for their
     keystrokes. */
  var nBefore = 0, idsBefore = [];
  var created = [];
  function scenario(tag, sentence, wantDay, wantHour, mayCreate) {
    return API.getState().then(function (st) {
      nBefore = (st.todos || []).length;
      idsBefore = (st.todos || []).map(function (t) { return t.id; });
    }).then(function () {
      q('#deckFace').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      return wait(650);
    }).then(function () {
      var i = q('#qText');
      i.value = sentence;
      i.dispatchEvent(new Event('input', { bubbles: true }));
      q('[data-act="ai"]').click();
      return wait(2600);
    }).then(function () {
      var rows = document.querySelectorAll('.ai-row');
      var kinds = Array.prototype.map.call(rows, function (r) { return r.dataset.kind; }).join('+');
      var said = rows[0] ? rows[0].querySelector('.ai-said').textContent.trim().replace(/\s+/g, ' ') : '-';
      var box = q('#qAi');
      var refusal = box && !rows.length ? box.textContent.trim().slice(0, 60) : '';
      var c = q('[data-act="aiCommit"]');
      if (c) c.click();
      return wait(900).then(function () { return { rows: rows.length, kinds: kinds, said: said, refusal: refusal }; });
    }).then(function (seen) {
      return API.getState().then(function (st) {
        var t = (st.todos || []).filter(function (x) { return x.id === seedId; })[0];
        var grew = (st.todos || []).length - nBefore;
        /* whatever this scenario wrote goes on the removal list, pass or fail: a test that
           leaves a duplicate of somebody's interview behind is worse than the bug it checks */
        (st.todos || []).forEach(function (x) {
          if (x.id !== seedId && idsBefore.indexOf(x.id) < 0 && created.indexOf(x.id) < 0) created.push(x.id);
        });
        var bad = [];
        if (seen.rows === 0 && !seen.refusal) bad.push('既没有草稿也没有解释');
        if (dayOf(t && t.dueAt) !== wantDay) bad.push('第 ' + dayOf(t && t.dueAt) + ' 天，应为第 ' + wantDay + ' 天');
        var d = new Date(t && t.dueAt);
        if (wantHour >= 0 && d.getHours() !== wantHour) bad.push('钟点 ' + d.getHours() + '，应为 ' + wantHour);
        if (!mayCreate && grew !== 0) bad.push('多出了 ' + grew + ' 条任务');
        note(tag + (bad.length ? ' ✗ ' + bad.join('；') : ' ✓') +
          ' · rows=' + seen.rows + ' ' + seen.kinds + ' · 存为 ' + at(t && t.dueAt) +
          ' · 总数 ' + (st.todos || []).length + (seen.refusal ? ' · 面板说：' + seen.refusal : ''));
      });
    });
  }

  setTimeout(function () {
    Promise.resolve()
      .then(function () { return API.getState(); })
      .then(function (st) {
        n0 = (st.todos || []).length;
        savedAi = JSON.parse(JSON.stringify((st.settings && st.settings.ai) || { on: false, base: '', model: '' }));
        note('start ai=' + JSON.stringify(savedAi) + ' todos=' + n0);
        return API.aiKeyHint();
      })
      .then(function (h) {
        if (!/未配置/.test(String(h))) return null;
        madeKey = true;
        return API.aiKeySave('sk-intent-test');
      })
      .then(function () {
        return API.op({ type: 'settings:update', patch: { ai: {
          on: true, base: 'http://127.0.0.1:8787/v1', model: 'mock' } } });
      })
      .then(function () { return wait(400); })
      .then(function () {
        /* one row this run owns outright. A unique title is deliberate: the store now carries
           several tasks named 面试 on the same day, and "which one" is then a fair question —
           that ambiguity is the bug's residue, not something to assert around */
        return API.op({ type: 'todo:add', title: '面试甲（自动测试）', groupId: 'g_work',
          dueAt: localIso(1, 14), activate: false });
      })
      .then(function (r) { seedId = r && r.id; note('seed=' + seedId); })
      /* A · the plain path: the model calls suggest_changes with the right id */
      .then(function () { return scenario('A 正常改动', '把面试甲（自动测试）推迟到后天', 2, 14); })
      /* B · the dialect path: the same call, written into the prose in the model's own markup */
      .then(function () { return scenario('B 正文里的调用', '方言 把面试甲（自动测试）推迟到大后天', 3, 14); })
      /* C · the wrong tool: two new drafts for one edit, refiled onto the named record */
      .then(function () { return scenario('C 选错工具', '把面试甲（自动测试）推迟到后天（选错工具）', 2, 14); })
      /* D · the model only wants to ask which one — but the sentence named it, so it answers
             itself and shows a change instead of a question */
      .then(function () { return scenario('D 想反问', '反复 把面试甲（自动测试）推迟到大后天', 3, 14); })
      /* E · nothing callable anywhere: decline, and leave the record exactly where D put it */
      .then(function () { return scenario('E 只会聊天', '只会聊天 把面试甲（自动测试）推迟到明天', 3, 14); })
      .then(function () {
        var kill = created.slice();
        if (seedId) kill.push(seedId);
        return Promise.all(kill.map(function (id) { return API.op({ type: 'todo:delete', id: id }); }))
          .then(function () { note('removed ' + kill.length + ' row(s) this run'); });
      })
      /* the deletes are ops like any other and the read behind them can be a beat older;
         without this the last line reported two rows that were already gone */
      .then(function () { return wait(400); })
      .then(function () { return API.getState(); })
      .then(function (st) {
        return API.op({ type: 'settings:update', patch: { ai: savedAi || { on: false } } })
          .then(function () { return madeKey ? API.aiKeyClear() : API.aiKeyHint(); })
          .then(function (h) {
            note('cleanup todos=' + (st.todos || []).length + '（应为 ' + n0 + '） ai=' +
              JSON.stringify(st.settings.ai) + ' key=' + h);
          });
      })
      .catch(function (e) { note('ERR ' + String((e && e.message) || e).slice(0, 200)); });
  }, 1500);
})();
