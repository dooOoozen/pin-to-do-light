/* 「删除示例数据后，时间账本/时间轴/仪表盘仍然有相关数据显示」

   The reducer is provably clean — load then clear returns todos, groups, time entries, the
   recycle bin and the active group to exactly what they were — so whatever is still on screen
   is a rendering problem, not a data one. This measures the three views the user named by
   fingerprint: it visits each one with an empty board, again with the sample loaded, and again
   after the clear, and reports which of them did not come back to its first fingerprint.

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/sample-residue.js */
(function () {
  var API = window.API;
  var fails = [], notes = [];
  function note(s) { try { API.bootNote('[E] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function check(ok, label) { if (!ok) fails.push(label); }
  function nav(text) {
    return Array.prototype.slice.call(document.querySelectorAll('#navFilters button')).filter(function (b) {
      return (b.textContent || '').indexOf(text) >= 0;
    })[0];
  }
  function txt(sel) {
    var n = document.querySelector(sel);
    return n ? (n.textContent || '').replace(/\s+/g, ' ').trim() : '-';
  }
  function count(sel) { return document.querySelectorAll(sel).length; }

  /* one visit, one fingerprint: what the person would read off this screen */
  function fingerprint(view) {
    var b = nav(view);
    if (!b) return Promise.resolve('NO NAV ' + view);
    b.click();
    return wait(800).then(function () {
      if (view === '时间账本') {
        return 'total=' + txt('.rp-fig-v') + ' rows=' + count('.rp-row') +
          ' cols=' + count('.rp-col') + ' segs=' + count('.rp-seg') +
          ' ring=' + txt('.rp-ring b') + ' legend=' + count('.rp-lg');
      }
      if (view === '时间轴') {
        return 'blks=' + count('.tk-blk') + ' cols=' + count('.tk-col') +
          ' recent=' + count('.tl-item, .tk-recent .task') + ' ring=' + txt('.tk-ring-num');
      }
      /* 仪表盘: the merged today module, the stats tiles, the heatmap and the short list */
      return 'stats=' + Array.prototype.slice.call(document.querySelectorAll('.pd-stats .stat .v'))
        .map(function (n) { return (n.textContent || '').trim(); }).join(',') +
        ' figs=' + txt('.today-figs') + ' heat=' + count('#heatBody i') +
        ' mini=' + count('#miniList .mini-row');
    });
  }

  var before = {}, loaded = {}, after = {};
  function sweepAll(views, into) {
    var chain = Promise.resolve();
    views.forEach(function (v) {
      chain = chain.then(function () { return fingerprint(v).then(function (f) { into[v] = f; }); });
    });
    return chain;
  }

  var VIEWS = ['时间账本', '时间轴', '仪表盘'];
  Promise.resolve().then(function () { return wait(2400); })
    .then(function () { return sweepAll(VIEWS, before); })
    .then(function () { return API.op({ type: 'sample:load' }); })
    .then(function () { return wait(900); })
    .then(function () { return sweepAll(VIEWS, loaded); })
    .then(function () { return API.op({ type: 'sample:clear' }); })
    .then(function () { return wait(900); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      check(st.todos.every(function (t) { return !t.demo; }),
        'sample rows survived the clear: ' + st.todos.length);
      check(st.timeEntries.every(function (e) { return !e.demo; }), 'sample runs survived');
      return sweepAll(VIEWS, after);
    })
    .then(function () {
      VIEWS.forEach(function (v) {
        note(v + ' empty: ' + before[v]);
        note(v + ' load : ' + loaded[v]);
        note(v + ' clear: ' + after[v]);
        check(loaded[v] !== before[v], v + ': loading the sample changed nothing on screen');
        check(after[v] === before[v], v + ': still shows sample data after the clear');
      });
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS every view returns to its empty-board reading'));
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
