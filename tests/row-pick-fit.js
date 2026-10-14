/* 界面缩小时，时间线的行还剩什么；时间轴的任务选择器能不能找得到任务。

   报告两件事：一是缩小之后「分组文字和日期重叠了，重复方式也和日期重叠」——行的右边那一块
   以前是 flex:none，装不下就直接画到日期列上面去了；二是「时间轴选择任务应该加上搜索按钮/
   筛选分组按钮」——选择任务的下拉以前把全部未完成任务一次性列出来。

   这里在四个界面缩放下逐行量：日期有没有被压住、标题还剩多宽、行有没有被挤成两行；然后把
   选择器的搜索框和分组下拉各用一次，看选项是不是真的跟着变，并确认打字过程中焦点没被重渲染
   抢走。用户自己的缩放与视图在结尾还原。

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/row-pick-fit.js */
(function () {
  var API = window.API, doc = document;
  function note(s) { try { API.bootNote('[F] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var bad = [], was = null;

  function clickView(word) {
    var b = Array.prototype.slice.call(doc.querySelectorAll('#navFilters button'))
      .filter(function (x) { return (x.textContent || '').indexOf(word) >= 0; })[0];
    if (b) b.click();
    return !!b;
  }
  function activeView() {
    var b = doc.querySelector('#navFilters button.on');
    return b ? (b.textContent || '').replace(/\d+$/, '') : null;
  }
  function rows() {
    return Array.prototype.slice.call(doc.querySelectorAll('#viewPanel .task'));
  }
  function overlap(a, b) {
    return a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  }

  function probeRows(tag) {
    var list = rows();
    if (!list.length) { bad.push(tag + ' NO-ROWS'); note(tag + ' rows=0'); return; }
    var over = 0, dateCut = 0, thin = 0, twoLines = 0, flagsHidden = 0;
    list.forEach(function (row) {
      var due = row.querySelector('.task-due'), line = row.querySelector('.task-line');
      var title = row.querySelector('.task-title'), b = row.querySelector('.task-due b');
      var right = row.querySelector('.task-right');
      if (line && due && overlap(line, due)) over++;
      if (b && b.getBoundingClientRect().width < 12) dateCut++;
      /* the floor is 3.2em of the title's own type; a title shorter than that is a short
         title, not a squashed one, so compare against whichever is smaller */
      if (!title) return;
      var em = parseFloat(getComputedStyle(title).fontSize) * 3.2;
      if (title.clientWidth + 1 < Math.min(title.scrollWidth, em)) thin++;
      if (right && right.getBoundingClientRect().width < 4) flagsHidden++;
      if (row.getBoundingClientRect().height > Math.round(title.getBoundingClientRect().height * 2.4) + 20) twoLines++;
    });
    var r0 = list[0].getBoundingClientRect(), t0 = list[0].querySelector('.task-title').getBoundingClientRect();
    note(tag + ' rows=' + list.length + ' overlap=' + over + ' date-cut=' + dateCut +
      ' title-thin=' + thin + ' flags-gone=' + flagsHidden + ' two-line=' + twoLines +
      ' row=' + Math.round(r0.width) + 'x' + Math.round(r0.height) + ' title=' + Math.round(t0.width));
    if (over) bad.push(tag + ' OVERLAP ' + over + '/' + list.length);
    if (dateCut) bad.push(tag + ' DATE-CUT ' + dateCut);
    if (thin) bad.push(tag + ' TITLE-TOO-THIN ' + thin);
    if (twoLines) bad.push(tag + ' ROW-WRAPPED ' + twoLines);
  }

  function probePicker() {
    var q = doc.getElementById('tkPickQ'), g = doc.getElementById('tkPickG'), sel = doc.getElementById('tkPick');
    if (!q || !g || !sel) { bad.push('PICKER-MISSING'); note('picker missing'); return; }
    var all = sel.options.length;
    q.focus();
    q.value = '会';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    var hit = sel.options.length;
    var focused = doc.activeElement === q;
    q.value = 'zzz-不可能存在的字样';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    var none = sel.options.length;
    var disabled = sel.disabled;
    q.value = '';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    /* pick the first group that still has open tasks, so the assertion is about filtering and
       not about a group that happens to be empty */
    var picked = null, pickedN = 0;
    for (var i = 1; i < g.options.length && !picked; i++) {
      g.value = g.options[i].value;
      g.dispatchEvent(new Event('change', { bubbles: true }));
      if (sel.options.length) { picked = g.options[i].value; pickedN = sel.options.length; }
    }
    g.value = '__all__';
    g.dispatchEvent(new Event('change', { bubbles: true }));
    var backAll = sel.options.length;
    note('picker all=' + all + ' query-会=' + hit + ' query-none=' + none +
      ' disabled-when-empty=' + disabled + ' kept-focus=' + focused +
      ' groups=' + (g.options.length - 1) + ' picked=' + pickedN + ' back-to-all=' + backAll);
    if (all < 1) bad.push('PICKER-EMPTY');
    if (hit >= all) bad.push('SEARCH-DOES-NOT-FILTER ' + hit + '>=' + all);
    if (none !== 0 || !disabled) bad.push('EMPTY-SEARCH-NOT-HANDLED');
    if (!focused) bad.push('SEARCH-LOST-FOCUS');
    if (!picked) bad.push('GROUP-FILTER-NO-HITS');
    if (pickedN >= all) bad.push('GROUP-FILTER-DOES-NOT-FILTER ' + pickedN + '>=' + all);
    if (backAll !== all) bad.push('FILTER-NOT-CLEARED ' + backAll + '<>' + all);
  }

  API.getState().then(function (st) {
    was = { uiScale: st.settings.uiScale, view: activeView() };
    note('start uiScale=' + was.uiScale + ' view=' + was.view);
    var chain = Promise.resolve();
    [0.85, 1, 1.15, 1.35].forEach(function (sc) {
      chain = chain.then(function () {
        return API.op({ type: 'settings:update', patch: { uiScale: sc } }).then(function () { return wait(620); });
      }).then(function () {
        if (!clickView('时间线')) { bad.push('no 时间线 button'); return; }
        return wait(420);
      }).then(function () { probeRows('scale=' + sc); });
    });
    chain = chain.then(function () {
      return API.op({ type: 'settings:update', patch: { uiScale: was.uiScale } }).then(function () { return wait(620); });
    }).then(function () {
      if (!clickView('时间轴')) { bad.push('no 时间轴 button'); return; }
      return wait(700);
    }).then(function () { probePicker(); });
    return chain;
  }).then(function () {
    return API.op({ type: 'settings:update', patch: { uiScale: was.uiScale } }).then(function () { return wait(400); });
  }).then(function () {
    if (was.view) clickView(was.view.trim());
    note('RESULT ' + (bad.length ? 'FAIL ' + bad.join(' | ') : 'PASS') + ' (uiScale + view restored)');
  }).catch(function (e) {
    if (was) API.op({ type: 'settings:update', patch: { uiScale: was.uiScale } });
    note('RESULT ERROR ' + (e && e.message));
  });
})();
