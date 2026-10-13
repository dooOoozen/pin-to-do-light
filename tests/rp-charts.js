/* 时间账本：两张图在同一个容器里、容器居中、界面放大后柱子不再变成厚板。

   Asserted per interface scale and per period (今天 24 小时 / 本周 7 天 / 本月 30 天):
   the column count, the widest column in pixels, the gap between the two charts, and how
   symmetric the container sits inside the page. The user's scale is written back at the end.

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/rp-charts.js */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[C] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var bad = [];
  var was = null;

  function nav(text) {
    return Array.prototype.slice.call(document.querySelectorAll('#navFilters button')).filter(function (b) {
      return (b.textContent || '').indexOf(text) >= 0;
    })[0];
  }
  function seg(text) {
    return Array.prototype.slice.call(document.querySelectorAll('.rp-bar .btn')).filter(function (b) {
      return (b.textContent || '').indexOf(text) >= 0;
    })[0];
  }

  function stop(tag) {
    var charts = document.querySelector('.rp-charts');
    if (!charts) { bad.push(tag + ' NO-CHARTS'); note(tag + ' no .rp-charts'); return Promise.resolve(); }
    var cols = Array.prototype.slice.call(charts.querySelectorAll('.rp-col'));
    var wrap = charts.parentElement;
    var cr = charts.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    var cs = getComputedStyle(wrap);
    var padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
    /* clientWidth, not the rect: the report page has a vertical scrollbar, and measuring to the
       rect's right edge would report the container as off-centre by the width of that bar */
    var leftGap = Math.round(cr.left - (wr.left + padL));
    var rightGap = Math.round((wr.left + wrap.clientWidth - padR) - cr.right);
    var widths = cols.map(function (n) { return Math.round(n.getBoundingClientRect().width); });
    var max = widths.length ? Math.max.apply(null, widths) : 0;
    var dense = !!charts.querySelector('.rp-cols.dense');
    var cap = dense ? 26 : 40;
    var ringBox = charts.querySelector('.rp-ring-box');
    var barL = charts.querySelector('.rp-chart-l');
    var inner = barL && ringBox ? Math.round(ringBox.getBoundingClientRect().left - barL.getBoundingClientRect().right) : -1;
    var line = tag + ' cols=' + cols.length + (dense ? '(dense)' : '') + ' maxW=' + max +
      ' chartL=' + Math.round(barL ? barL.getBoundingClientRect().width : 0) +
      ' ringBox=' + Math.round(ringBox ? ringBox.getBoundingClientRect().width : 0) +
      ' inner-gap=' + inner + ' side-gaps=' + leftGap + '/' + rightGap;
    if (!cols.length) bad.push(tag + ' NO-COLUMNS');
    else if (max > cap + 1) bad.push(tag + ' BAR-WIDER-THAN-CAP ' + max + '>' + cap);
    if (!ringBox || !barL) bad.push(tag + ' NOT-ONE-CONTAINER');
    else if (inner > 90) bad.push(tag + ' INNER-GAP ' + inner);
    /* centring only means something once there is slack to divide; when the container fills the
       page the two gaps are both ~0 and the check would be noise */
    else if (leftGap + rightGap > 24 && Math.abs(leftGap - rightGap) > 6) bad.push(tag + ' OFF-CENTRE ' + leftGap + '/' + rightGap);
    note(line);
    return Promise.resolve();
  }

  function set(patch) {
    return API.op({ type: 'settings:update', patch: patch }).then(function () { return wait(600); });
  }
  function period(name, cb) {
    var b = seg(name);
    if (!b) { note('no ' + name + ' button, measuring current period only'); return cb(); }
    b.click();
    return wait(700).then(cb);
  }

  API.getState().then(function (st) {
    was = st.settings.uiScale;
    var b = nav('时间账本');
    if (!b) throw new Error('no 时间账本 in #navFilters');
    b.click();
    return wait(800);
  })
    .then(function () { return set({ uiScale: 1.35 }); })
    .then(function () {
      return period('本周', function () { return stop('1.35 本周'); })
        .then(function () { return period('本月', function () { return stop('1.35 本月'); }); })
        .then(function () { return period('今天', function () { return stop('1.35 今天'); }); });
    })
    .then(function () { return set({ uiScale: 0.85 }); })
    .then(function () { return period('本周', function () { return stop('0.85 本周'); }); })
    .then(function () { return set({ uiScale: was }); })
    .then(function () {
      note('RESULT ' + (bad.length ? 'FAIL ' + bad.join(' | ') : 'PASS') + ' (restored uiScale=' + was + ')');
    })
    .catch(function (e) {
      if (was != null) API.op({ type: 'settings:update', patch: { uiScale: was } });
      note('RESULT ERROR ' + (e && e.message));
    });
})();
