/* 时间线一行窄下来以后先丢谁。

   报告是「界面缩小时，任务标题大部分不显示」。实测在界面缩放 1.35、面板拖到最小宽度时，一行只有
   ~330px，日期列（日期 + 倒计时）158px 和左侧时间栏 42px 都不肯让，标题被压到 3.2em 的地板上。
   dashboard.css 末尾的 @container row 规则让这两项先出局，这里按四档容器宽度复核：标题至少要露出
   六成，日期在任何一档都不许被截断，窄档里时间栏和倒计时确实消失了。

   宽度是把 .app 的宽度钉住模拟的——面板本身没有对渲染端开放的改尺寸接口，而行宽正是从 .app 一层层
   流下来的，同一套 flex 计算，只有触发宽度的来源不同。

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/row-narrow.js */
(function () {
  var API = window.API, doc = document;
  function note(s) { try { API.bootNote('[N] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function w(n) { return n ? Math.round(n.getBoundingClientRect().width) : -1; }
  var bad = [];

  function toView(text) {
    var b = Array.prototype.slice.call(doc.querySelectorAll('#navFilters button'))
      .filter(function (x) { return (x.textContent || '').indexOf(text) >= 0; })[0];
    if (b) b.click();
    return !!b;
  }

  /* the longest title in the list is the one the report is about — a short title that fits is not
     evidence of anything */
  function longest() {
    var best = null;
    Array.prototype.forEach.call(doc.querySelectorAll('.task .task-title'), function (n) {
      if (!best || n.textContent.length > best.textContent.length) best = n;
    });
    return best;
  }

  function stop(tag, appW) {
    var app = doc.querySelector('.app');
    app.style.width = appW + 'px';
    app.style.maxWidth = 'none';
    var t = longest();
    if (!t) { bad.push(tag + ' NO-ROWS'); return; }
    var row = t.closest('.task');
    var due = row.querySelector('.task-due b');
    var gutter = row.querySelector('.tl-time');
    var cd = row.querySelector('.task-due i');
    var tw = t.getBoundingClientRect().width;
    /* one glyph of this title, measured from the whole string: CJK here, so the count is honest
       enough to fail on */
    var per = t.scrollWidth / Math.max(1, t.textContent.length);
    var shown = Math.floor(tw / per);
    var kids = Array.prototype.map.call(row.children, function (n) {
      var cs = getComputedStyle(n);
      return (n.className || n.tagName).toString().split(' ')[0] + ':' +
        (cs.display === 'none' ? 'off' : Math.round(n.getBoundingClientRect().width));
    }).join(' ');
    var rc = row.querySelector('.task-right'), fc = row.querySelector('.task-flags');
    var rcs = rc ? getComputedStyle(rc) : null;
    var fcs = fc ? getComputedStyle(fc) : null;
    var lineEl = row.querySelector('.task-line');
    var lineKids = lineEl ? Array.prototype.map.call(lineEl.children, function (n) {
      return (n.className || n.tagName).toString().split(' ')[0] + ':' + Math.round(n.getBoundingClientRect().width);
    }).join(' ') : '-';
    var line = tag + ' app=' + appW + ' row=' + w(row) + ' [' + kids + '] line=[' + lineKids + '] title=' +
      Math.round(tw) + '/' + t.scrollWidth +
      ' rightCSS=' + (rcs ? rcs.flexShrink + '/' + rcs.minWidth + '/' + rcs.flexBasis : '-') +
      ' flagsCSS=' + (fcs ? fcs.flexShrink + '/' + fcs.minWidth : '-') +
      ' chars=' + shown + '/' + t.textContent.length +
      ' due=' + w(due) + ' due-cut=' + (due && due.scrollWidth > due.clientWidth + 1 ? 'YES' : 'no') +
      ' gutter=' + (gutter && getComputedStyle(gutter).display !== 'none' ? 'on' : 'off') +
      ' countdown=' + (cd && getComputedStyle(cd).display !== 'none' ? 'on' : 'off');
    note(line);
    if (due && due.scrollWidth > due.clientWidth + 1) bad.push(tag + ' DATE-CUT');
    /* the date can be un-cut and still wrong: a column that shrank to 30px around an 82px date
     * draws the date outside itself, over the title, which is what 日期和分组重叠 looked like */
    if (due && due.parentElement.clientWidth + 1 < due.clientWidth) {
      bad.push(tag + ' DATE-OVERFLOWS-COLUMN ' + due.clientWidth + '>' + due.parentElement.clientWidth);
    }
    /* the date is what the row is for; at the widest stop the countdown rides beside it, and at the
       narrow stops the duplicated time and the countdown are what give way */
    if (appW <= 460 && gutter && getComputedStyle(gutter).display !== 'none') bad.push(tag + ' GUTTER-KEPT');
    if (appW <= 460 && cd && getComputedStyle(cd).display !== 'none') bad.push(tag + ' COUNTDOWN-KEPT');
    if (appW >= 1200 && tag.indexOf("all") < 0 && !gutter) bad.push(tag + ' GUTTER-MISSING');
    /* 大部分不显示 is about the row, not about the longest string in the store: a 52-character
       title cannot fit a 383px row at any priority order, so what is asserted is that the title
       still owns the largest share of the row once the duplicated time and the countdown have
       given way. */
    if (tw < row.getBoundingClientRect().width * 0.42) {
      bad.push(tag + ' TITLE-STARVED ' + Math.round(tw) + '/' + Math.round(row.getBoundingClientRect().width));
    }
  }

  API.getState().then(function () {
    if (!toView('时间线')) bad.push('no 时间线 button');
    return wait(900);
  }).then(function () {
    var chain = Promise.resolve();
    [[1240, 1240], [900, 900], [660, 660], [520, 520]].forEach(function (s) {
      chain = chain.then(function () { stop('app=' + s[0], s[1]); return wait(120); });
    });
    return chain;
  }).then(function () {
    /* the same four stops on 全部任务, where there is no time gutter and the row is built by the
       same function — the rules must not depend on the timeline view */
    var app = doc.querySelector('.app');
    if (!toView('全部')) bad.push('no 全部 button');
    return wait(900);
  }).then(function () {
    var chain = Promise.resolve();
    [[1240, 1240], [660, 660], [520, 520]].forEach(function (s) {
      chain = chain.then(function () { stop('all app=' + s[0], s[1]); return wait(120); });
    });
    return chain;
  }).then(function () {
    var app = doc.querySelector('.app');
    app.style.width = ''; app.style.maxWidth = '';
    note('RESULT ' + (bad.length ? 'FAIL ' + bad.join(' | ') : 'PASS') + ' (width restored)');
  }).catch(function (e) {
    var app = doc.querySelector('.app');
    if (app) { app.style.width = ''; app.style.maxWidth = ''; }
    note('RESULT ERROR ' + (e && e.message));
  });
})();
