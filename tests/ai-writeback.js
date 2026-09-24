/* The two reported failures, driven from outside in the app's own window.
   (1) 确认修改 said 后天 and the panel kept the old day. The fix is in `Agent.commit`, and the
       only assertion that means anything is the stored record read back from the real store
       after the real button is clicked — a green trace with an untouched task is exactly what
       shipped last time.
   (2) The panel vanished on an outside click while the assistant was still answering. Asserted
       both ways: pinned during the request and while drafts are up, and NOT pinned when the AI
       was never used, because that dismissal is the behaviour the card layer is supposed to
       keep.
   Everything it creates is deleted again, and the AI setting and credential are left exactly
   as it found them — this runs against the one store the app has, with no backup. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[U] ' + s); } catch (e) { /* no bridge */ } }
  function q(sel) { return document.querySelector(sel); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function p(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(iso) {
    if (!iso) return '无日期';
    var d = new Date(iso);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function localIso(dayOffset, h, min) {
    var d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, min, 0, 0);
    return d.toISOString();
  }
  function outsideClick() {
    var bd = q('.modal-backdrop');
    if (!bd) return 'no-backdrop';
    bd.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    return 'clicked';
  }
  function openLabel() { return q('#modalRoot.open') ? 'open' : 'closed'; }

  var seedId = null;
  var before = null;
  /* Whatever the person had configured is put back at the end, and a key already in the
     credential store is left alone: the mock ignores the Authorization header, so overwriting
     a real token buys nothing and costs them a re-paste. */
  var savedAi = null;

  setTimeout(function () {
    Promise.resolve()
      .then(function () { return API.getState(); })
      .then(function (st) {
        savedAi = JSON.parse(JSON.stringify((st.settings && st.settings.ai) || { on: false, base: '', model: '' }));
        note('was ai=' + JSON.stringify(savedAi));
        return API.aiKeyHint();
      })
      .then(function (h) {
        if (!/未配置/.test(String(h))) { note('keeping the stored key (' + h + ')'); return null; }
        madeKey = true;
        return API.aiKeySave('sk-ui-test-key');
      })
      .then(function () {
        return API.op({ type: 'settings:update', patch: { ai: {
          on: true, base: 'http://127.0.0.1:8787/v1', model: 'mock' } } });
      })
      .then(function () { return wait(400); })
      /* one task to move, at tomorrow 14:00. A fresh add lands at the head of the list, which
         is what puts it first in the prompt the mock reads from. */
      .then(function () {
        return API.op({ type: 'todo:add', title: '面试 候选人甲（自动测试）', groupId: 'g_work',
          dueAt: localIso(1, 14, 0), activate: false });
      })
      .then(function (r) {
        seedId = r && r.id;
        note('seed=' + seedId);
        q('#deckFace').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        return wait(700);
      })
      .then(function () {
        var i = q('#qText');
        /* 慢 makes the mock hold its answer for 1.4s, so the click below really does land
           while the request is in flight rather than after it */
        i.value = '临时有个会，把明天的面试推后到后天（慢慢来）';
        i.dispatchEvent(new Event('input', { bubbles: true }));
        q('[data-act="ai"]').click();
        return wait(300);
      })
      .then(function () {
        /* the request is still in flight — this is the click that used to eat the panel */
        note('PIN during wait: ' + outsideClick() + ' -> modal=' + openLabel() +
          ' text=' + (q('.ai-wait') ? q('.ai-wait').textContent.trim() : '-'));
        return wait(2000);
      })
      .then(function () {
        var rows = document.querySelectorAll('.ai-row');
        var w = rows[0] ? rows[0].querySelector('.ai-when') : null;
        note('PIN with drafts: ' + outsideClick() + ' -> modal=' + openLabel() +
          ' rows=' + rows.length + ' kinds=' + (rows[0] ? rows[0].dataset.kind : '-') +
          ' when=' + (w ? w.value : '-') + ' said=' + (rows[0] ? rows[0].querySelector('.ai-said').textContent.trim() : '-'));
        var c = q('[data-act="aiCommit"]');
        if (!c) { note('NO COMMIT BUTTON'); return null; }
        c.click();
        return wait(900);
      })
      .then(function () { return API.getState(); })
      .then(function (st) {
        var t = (st.todos || []).filter(function (x) { return x.id === seedId; })[0];
        before = localIso(1, 14, 0);
        note('MOVED stored=' + stamp(t && t.dueAt) + ' expected=' + stamp(localIso(2, 14, 0)) +
          ' was=' + stamp(before) + ' title=' + (t ? t.title : '-') + ' modal=' + openLabel());
        /* the pin is per-modal: with the AI never used, an outside click still dismisses */
        q('#deckFace').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        return wait(600);
      })
      .then(function () {
        note('PLAIN quick-add: ' + outsideClick() + ' -> modal=' + openLabel());
        return wait(200);
      })
      .then(function () {
        if (!seedId) return null;
        return API.op({ type: 'todo:delete', id: seedId });
      })
      .then(function () { return API.getState(); })
      .then(function (st) {
        return API.op({ type: 'settings:update', patch: { ai: savedAi || { on: false, base: '', model: '' } } })
          .then(function () { return madeKey ? API.aiKeyClear() : API.aiKeyHint(); })
          .then(function (h) { note('cleanup todos=' + (st.todos || []).length + ' ai=' + JSON.stringify(savedAi) + ' key=' + h); });
      })
      .catch(function (e) { note('ERR ' + String((e && e.message) || e).slice(0, 200)); });
  }, 1500);
})();
