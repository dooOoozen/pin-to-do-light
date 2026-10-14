/* 今日概览在窄版面上是不是只剩「环形图小、四个格子扁」这一种排法。

   3×1 时 .pd-stats 走的是 `repeat(2, minmax(0,1fr))`：两列各占满模块宽度的一半，于是格子约
   150×45，是个扁长方形，而它上面的环形图只有 ~77px 宽。这里把 span 和 row 都过一遍，量出
   环形图直径、单个格子的宽高与宽高比，以及标签有没有被省略号截掉，改完之后仍然用同一把尺子。

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/today-tiles.js */
(function () {
  var API = window.API, doc = document;
  function note(s) { try { API.bootNote('[T] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var bad = [], was = null;

  function toDash() {
    var b = Array.prototype.slice.call(doc.querySelectorAll('#navFilters button'))
      .filter(function (x) { return (x.textContent || '').indexOf('仪表盘') >= 0; })[0];
    if (b) b.click();
    return !!b;
  }
  function probe(tag, span, row) {
    var mod = doc.getElementById('modToday');
    var body = doc.querySelector('#modToday .mod-today-body');
    var stats = doc.querySelector('#modToday .pd-stats');
    var ring = doc.getElementById('todayRing');
    if (!mod || !body || !stats || !ring) { bad.push(tag + ' MISSING'); return; }
    var tiles = Array.prototype.slice.call(stats.querySelectorAll('.stat'));
    if (!tiles.length) { bad.push(tag + ' NO-TILES'); return; }
    var rb = ring.getBoundingClientRect();
    var sr = stats.getBoundingClientRect();
    var m = mod.getBoundingClientRect();
    var sizes = tiles.map(function (n) {
      var r = n.getBoundingClientRect();
      return Math.round(r.width) + 'x' + Math.round(r.height);
    });
    var t0 = tiles[0].getBoundingClientRect();
    var aspect = t0.width / t0.height;
    var gap = parseFloat(getComputedStyle(stats).rowGap) || 6;
    var want = t0.height * 2 + gap;
    var room = body.clientHeight;
    var cols = getComputedStyle(stats).gridTemplateColumns.split(' ').length;
    var cut = tiles.filter(function (n) {
      var k = n.querySelector('.k');
      return k && k.scrollWidth > k.clientWidth + 1;
    }).length;
    /* the tile clips both ways: aspect-ratio squashed a 48px-wide tile to 22px tall and cut the
       number in half, which no horizontal check would ever see */
    var sq = tiles.filter(function (n) { return n.scrollHeight > n.clientHeight + 1; }).length;
    var line = tag + ' plate=' + Math.round(m.width) + 'x' + Math.round(m.height) +
      ' ring=' + Math.round(rb.width) + 'x' + Math.round(rb.height) +
      ' want2=' + Math.round(want) + '/' + room +
      ' stats=' + Math.round(sr.width) + 'x' + Math.round(sr.height) + ' cols=' + cols +
      ' tiles=' + sizes.join(',') + ' aspect=' + aspect.toFixed(2) + ' label-cut=' + cut +
      ' sqashed=' + sq;
    note(line);
    if (sq) bad.push(tag + ' TILE-SQUASHED ' + sq + '/' + tiles.length);
    /* the short plate is the one that reported 长方形: four tiles across it must come in at
       roughly square, while a two-row plate keeps its wide counters on purpose */
    if (row === 1 && aspect > 2.4) bad.push(tag + ' TILE-TOO-WIDE ' + aspect.toFixed(2));
    if (Math.abs(rb.width - rb.height) > 1) bad.push(tag + ' RING-NOT-SQUARE');
    /* 环形图直径 = 两个格子的高度, or exactly as much of it as the plate has left */
    if (rb.width > want + 1) bad.push(tag + ' RING-OVER-TWO-TILES ' + Math.round(rb.width) + '>' + Math.round(want));
    if (rb.width < Math.min(want, room) - 3) bad.push(tag + ' RING-UNDER-TWO-TILES ' + Math.round(rb.width) + '<' + Math.round(Math.min(want, room)));
    if (cut > 0 && cut < tiles.length) bad.push(tag + ' SOME-LABELS-CUT ' + cut + '/' + tiles.length);
  }

  API.getState().then(function (st) {
    was = { uiScale: st.settings.uiScale, dashLayout: JSON.parse(JSON.stringify(st.settings.dashLayout || {})) };
    if (!toDash()) bad.push('no 仪表盘 button');
    var open = JSON.parse(JSON.stringify(was.dashLayout));
    open.collapsed = [];
    return API.op({ type: 'settings:update', patch: { dashLayout: open } }).then(function () { return wait(700); });
  }).then(function () {
    var chain = Promise.resolve();
    [2, 3, 4, 6].forEach(function (span) {
      [1, 2].forEach(function (row) {
        chain = chain.then(function () {
          var L = JSON.parse(JSON.stringify(was.dashLayout));
          L.span = L.span || {}; L.span.today = span;
          L.row = L.row || {}; L.row.today = row;
          L.collapsed = [];
          return API.op({ type: 'settings:update', patch: { dashLayout: L } })
            .then(function () { return wait(650); });
        }).then(function () { probe(span + 'x' + row, span, row); });
      });
    });
    return chain;
  }).then(function () {
    return API.op({ type: 'settings:update', patch: { uiScale: was.uiScale, dashLayout: was.dashLayout } });
  }).then(function () {
    note('RESULT ' + (bad.length ? 'FAIL ' + bad.join(' | ') : 'PASS') + ' (layout restored)');
  }).catch(function (e) {
    if (was) API.op({ type: 'settings:update', patch: { uiScale: was.uiScale, dashLayout: was.dashLayout } });
    note('RESULT ERROR ' + (e && e.message));
  });
})();
