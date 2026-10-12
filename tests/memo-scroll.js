/* Saving a memo threw the view back to the top. Nothing at page level scrolls on the
   dashboard — the places a person actually scrolls are the module bodies — so this measures the
   one the user named: fill the memo pad, scroll it, type, press Enter, and read the offset back.

   The memo is written through the input and the Enter key rather than by calling addMemo,
   because the bug lived in what the key handler triggers. Everything the test adds is taken
   back out: the memo list is the user's own scratch pad.

   Run on the second display:
     pin-tauri.exe --monitor 2 --test-script-panel tests/memo-scroll.js */
(function () {
  var API = window.API;
  var fails = [], notes = [];
  function note(s) { try { API.bootNote('[M] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function check(ok, label) { if (!ok) fails.push(label); }
  function nav(text) {
    return Array.prototype.slice.call(document.querySelectorAll('#navFilters button')).filter(function (b) {
      return (b.textContent || '').indexOf(text) >= 0;
    })[0];
  }
  /* the element that actually moves, found from the memo list upward rather than assumed */
  function scrollerOf(node) {
    for (var e = node; e && e !== document.body; e = e.parentElement) {
      var cs = getComputedStyle(e);
      if (/auto|scroll/.test(cs.overflowY) && e.scrollHeight - e.clientHeight > 24) return e;
    }
    return null;
  }

  var wasMemo = null;
  Promise.resolve().then(function () { return wait(2400); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      wasMemo = st.settings.memo;
      /* a pad with two lines in it cannot scroll, and a test that cannot scroll has nothing
         to say about where the scroll ended up */
      var lines = [];
      for (var i = 0; i < 14; i++) {
        lines.unshift({ id: 'zz' + i, text: 'ZZ 备忘占位 ' + (i + 1) + ' · 这一行存在的意义是把备忘模块撑到可以滚动', at: new Date().toISOString() });
      }
      return API.op({ type: 'settings:update', patch: { memo: lines } });
    })
    .then(function () {
      nav('仪表盘').click();
      return wait(800);
    })
    .then(function () {
      var box = document.getElementById('memoInput');
      check(!!box, 'no memo input on the dashboard');
      var host = document.getElementById('memoList');
      var s = host ? scrollerOf(host) : null;
      check(!!s, 'the memo list has no scrollable ancestor to lose');
      if (!box || !s) return null;
      s.scrollTop = 180;
      return wait(150).then(function () {
        var deep = s.scrollTop;
        check(deep > 40, 'the memo pad will not scroll: ' + deep);
        box.value = 'ZZ 滚动测试备忘';
        box.focus();
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return wait(900).then(function () {
          notes.push('scrolled ' + deep + ' → after Enter ' + s.scrollTop);
          check(Math.abs(s.scrollTop - deep) <= 2, 'Enter in the memo box moved the reader: ' +
            deep + ' → ' + s.scrollTop);
          var still = document.getElementById('memoInput');
          check(!!still && still.value === '', 'the memo box did not clear itself');
          return null;
        });
      });
    })
    .then(function () {
      /* the same offset must NOT survive walking into a different view */
      var host = document.getElementById('memoList');
      var s = host ? scrollerOf(host) : null;
      if (s) s.scrollTop = 120;
      nav('全部任务').click();
      return wait(700).then(function () {
        var list = document.getElementById('list');
        notes.push('view change → #list scrollTop ' + list.scrollTop);
        check(list.scrollTop === 0, 'changing view did not return to the top: ' + list.scrollTop);
        return null;
      });
    })
    .then(function () { return API.op({ type: 'settings:update', patch: { memo: wasMemo } }); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      check(JSON.stringify(st.settings.memo || []) === JSON.stringify(wasMemo || []),
        'the memo pad did not come back: ' + JSON.stringify(st.settings.memo));
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS') + ' ' + notes.join(' | '));
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
