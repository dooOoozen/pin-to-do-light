/* "回收站点进去字体明显和其他板块不一样" — a claim about one view's text against the others',
   so compare like with like.

   The app deliberately carries TWO families (a mono for body text and a UI sans for headings,
   both set per material), so "one family everywhere" is not the rule and an audit written that
   way fails on every view for the wrong reason. What must agree is the same ROLE: a task row
   says the same thing in 全部任务, 已完成, a group, the month grid's day list and the recycle
   bin, so its family, size and weight have to be identical in all five. That is exactly the
   comparison the bin lost — its row title inherited the 13px body while the ledger's is
   12.5px/700.

   Views whose rows are not tasks (the axis, the ledger of hours, the dashboard) are reported
   rather than asserted. The sample board loads first so there are rows to measure on a board
   that is empty, and is cleared afterwards.

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/font-audit.js */
(function () {
  var API = window.API;
  var fails = [], notes = [];
  function note(s) { try { API.bootNote('[F] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function check(ok, label) { if (!ok) fails.push(label); }
  function nav(text) {
    return Array.prototype.slice.call(document.querySelectorAll('#navFilters button')).filter(function (b) {
      return (b.textContent || '').indexOf(text) >= 0;
    })[0];
  }
  function sideRow(text) {
    return Array.prototype.slice.call(document.querySelectorAll('.group-list li')).filter(function (b) {
      return (b.textContent || '').indexOf(text) >= 0;
    })[0];
  }
  function firstFamily(stack) {
    return String(stack || '').split(',')[0].replace(/["']/g, '').trim();
  }
  /* the first visible node of the selector, read as a person sees it */
  function voice(sel) {
    var list = document.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) {
      if (list[i].offsetParent === null) continue;
      var cs = getComputedStyle(list[i]);
      return { fam: firstFamily(cs.fontFamily), size: parseFloat(cs.fontSize), weight: cs.fontWeight, n: list.length };
    }
    return null;
  }

  /* views whose primary row IS a task, and the selector that carries its title */
  var TASK_VIEWS = [
    { label: '全部任务', entry: function () { return nav('全部任务'); }, sel: '.task-title' },
    { label: '已完成', entry: function () { return nav('已完成'); }, sel: '.task-title' },
    { label: '月历', entry: function () { return nav('月历'); }, sel: '.task-title' },
    { label: '回收站', entry: function () { return sideRow('回收站'); }, sel: '.tr-title' },
    { label: '分组', entry: function () { return sideRow('示例·项目'); }, sel: '.task-title' }
  ];
  /* reported, not judged: different content, different role */
  var OTHER_VIEWS = [
    { label: '时间轴', entry: function () { return nav('时间轴'); }, sel: '.tk-blk-n' },
    { label: '时间账本', entry: function () { return nav('时间账本'); }, sel: '.rp-row-k' },
    { label: '仪表盘', entry: function () { return nav('仪表盘'); }, sel: '.memo-row' }
  ];

  function visit(v) {
    var e = v.entry();
    if (!e) { fails.push('no entry for ' + v.label); return Promise.resolve(null); }
    e.click();
    return wait(750).then(function () { return voice(v.sel); });
  }

  var base = null;
  Promise.resolve().then(function () { return wait(2400); })
    .then(function () { return API.op({ type: 'sample:load' }); })
    .then(function () { return wait(600); })
    /* an empty bin is a legitimate state and has no row to measure, so put one of the
       sample's own tasks in it — the clear at the end takes it out again */
    .then(function () { return API.getState(); })
    .then(function (st) {
      var one = st.todos.filter(function (t) { return t.demo === 's50' && !t.done; })[0];
      if (!one) { fails.push('the sample board did not load'); return null; }
      return API.op({ type: 'todo:delete', id: one.id });
    })
    .then(function () { return wait(400); })
    .then(function () {
      var chain = Promise.resolve();
      TASK_VIEWS.forEach(function (v) {
        chain = chain.then(function () {
          return visit(v).then(function (t) {
            if (!t) { fails.push(v.label + ': nothing matched ' + v.sel); return null; }
            var s = v.label + ' ' + v.sel + ' = ' + t.fam + ' ' + t.size + 'px/' + t.weight + ' ×' + t.n;
            notes.push(s);
            if (!base) { base = t; return null; }
            check(t.fam === base.fam, v.label + ' title family is ' + t.fam + ', the ledger is ' + base.fam);
            check(Math.abs(t.size - base.size) < 0.01, v.label + ' title is ' + t.size + 'px, the ledger is ' + base.size + 'px');
            check(t.weight === base.weight, v.label + ' title weight is ' + t.weight + ', the ledger is ' + base.weight);
            return null;
          });
        });
      });
      OTHER_VIEWS.forEach(function (v) {
        chain = chain.then(function () {
          return visit(v).then(function (t) {
            notes.push(v.label + ' ' + v.sel + ' = ' + (t ? t.fam + ' ' + t.size + 'px/' + t.weight + ' ×' + t.n : 'absent'));
            return null;
          });
        });
      });
      return chain;
    })
    .then(function () { return API.op({ type: 'sample:clear' }); })
    .then(function () { return wait(500); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      check(st.todos.every(function (t) { return !t.demo; }), 'sample rows survived: ' + st.todos.length);
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS') + ' ' + notes.join(' | '));
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
