/* The ✨ button, driven the way a user drives it.
   The module test proves the loop; this proves the feature: the quick-add modal really does
   grow an entry when the setting is on, the draft rows really are editable inputs, and the
   only thing that reaches the store is what those inputs say at the moment 确认写入 is
   clicked — including an edit made here to prove the model's text is not what gets saved.
   Everything it creates is deleted again, and the AI setting is left off. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[U] ' + s); } catch (e) { /* no bridge */ } }
  function q(sel) { return document.querySelector(sel); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var created = [];
  /* the one store the app has is the user's real data: record what was there and put it back,
     and never overwrite a credential the test does not need — the mock ignores the header */
  var savedAi = null;
  var madeKey = false;

  setTimeout(function () {
    var n0 = 0, editedTitle = '面试 候选人A（改到 10:30）';
    API.getState().then(function (st) {
      n0 = (st.todos || []).length;
      savedAi = JSON.parse(JSON.stringify((st.settings && st.settings.ai) || { on: false, base: '', model: '' }));
      return API.aiKeyHint();
    }).then(function (h) {
      if (!/未配置/.test(String(h))) return null;
      madeKey = true;
      return API.aiKeySave('sk-ui-test-key');
    }).then(function () {
      return API.op({ type: 'settings:update', patch: { ai: {
        on: true, base: 'http://127.0.0.1:8787/v1', model: 'mock' } } });
    }).then(function () { return wait(400); })
      .then(function () {
        /* double-click the deck face: that is the gesture that opens 快速登记 */
        q('#deckFace').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        return wait(700);
      })
      .then(function () {
        note('modal qText=' + !!q('#qText') + ' aiBox=' + !!q('#qAi') + ' btn=' + !!q('[data-act="ai"]'));
        var i = q('#qText');
        i.value = '下周二下午我有三个人需要面试，帮我安排好时间';
        i.dispatchEvent(new Event('input', { bubbles: true }));
        q('[data-act="ai"]').click();
        return wait(2200);
      })
      .then(function () {
        var rows = document.querySelectorAll('.ai-row');
        note('rows=' + rows.length +
          ' firstWhen=' + (rows[0] ? rows[0].querySelector('.ai-when').value : '-') +
          ' said=' + (rows[0] ? rows[0].querySelector('.ai-said').textContent.trim() : '-') +
          ' commitBtn=' + (q('[data-act="aiCommit"]') ? q('[data-act="aiCommit"]').textContent : '-'));
        if (!rows.length) return null;
        /* the user fixes one row: title and time both */
        rows[0].querySelector('.ai-title').value = editedTitle;
        rows[0].querySelector('.ai-when').value = String(rows[0].querySelector('.ai-when').value)
          .replace('T14:00', 'T10:30');
        q('[data-act="aiCommit"]').click();
        return wait(900);
      })
      .then(function () { return API.getState(); })
      .then(function (st) {
        created = (st.todos || []).filter(function (t) { return /^面试 候选人/.test(t.title); });
        var p = function (n) { return (n < 10 ? '0' : '') + n; };
        var when = function (iso) {
          var d = new Date(iso);
          return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
        };
        var edited = created.filter(function (t) { return t.title === editedTitle; })[0];
        note('stored=' + (st.todos || []).length + ' of ' + n0 + ' mine=' + created.length +
          ' editedRowWritten=' + !!edited + ' editedWhen=' + (edited ? when(edited.dueAt) : '-') +
          ' modalClosed=' + !q('#modalRoot.open'));
        return Promise.all(created.map(function (t) { return API.op({ type: 'todo:delete', id: t.id }); }));
      })
      .then(function () { return API.getState(); })
      .then(function (st) {
        return API.op({ type: 'settings:update', patch: { ai: savedAi || { on: false, base: '', model: '' } } })
          .then(function () { return madeKey ? API.aiKeyClear() : API.aiKeyHint(); })
          .then(function (h) { note('cleanup todos=' + (st.todos || []).length + ' ai=' + JSON.stringify(savedAi) + ' key=' + h); });
      })
      .catch(function (e) { note('ERR ' + String((e && e.message) || e).slice(0, 160)); });
  }, 1500);
})();
