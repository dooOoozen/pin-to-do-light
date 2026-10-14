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
  function font(tile, sel) {
    var n = tile && tile.querySelector(sel);
    return n ? parseFloat(getComputedStyle(n).fontSize) : 0;
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
    /* the plate's own tracks: column 1 is the ring's, column 2 the counters'. A block that stops
       short of its track is the dead space the report is about, so fill is measured against the
       track rather than against the module. */
    var colsTr = getComputedStyle(body).gridTemplateColumns.split(' ').map(parseFloat);
    var rowsTr = getComputedStyle(body).gridTemplateRows.split(' ').map(parseFloat);
    var side = colsTr.length === 2;
    var areaW = side ? colsTr[1] : sr.width;
    var areaH = side ? (rowsTr[0] || sr.height) : sr.height;
    var fillW = sr.width / areaW, fillH = sr.height / areaH;
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
      ' stats=' + Math.round(sr.width) + 'x' + Math.round(sr.height) +
      ' area=' + Math.round(areaW) + 'x' + Math.round(areaH) +
      ' fill=' + Math.round(fillW * 100) + '/' + Math.round(fillH * 100) +
      ' cols=' + tiles.filter(function (n) { return Math.round(n.getBoundingClientRect().top) === Math.round(t0.top); }).length +
      ' tiles=' + sizes.join(',') + ' aspect=' + aspect.toFixed(2) +
      ' vFont=' + Math.round(font(tiles[0], '.v') * 10) / 10 + ' kFont=' + Math.round(font(tiles[0], '.k') * 10) / 10 +
      ' badge=' + (doc.querySelector('#modToday .stat .idx-mark') &&
        getComputedStyle(doc.querySelector('#modToday .stat .idx-mark')).display !== 'none' ? 'on' : 'off') +
      ' label-cut=' + cut + ' sqashed=' + sq;
    note(line);
    if (sq) bad.push(tag + ' TILE-SQUASHED ' + sq + '/' + tiles.length);
    if (side) {
      /* 尽量铺满模块: both axes, or the block is back to floating in the plate */
      if (fillW < 0.97) bad.push(tag + ' NOT-WIDE ' + Math.round(fillW * 100) + '%');
      if (fillH < 0.9) bad.push(tag + ' NOT-TALL ' + Math.round(fillH * 100) + '%');
      /* and a filled block still has to divide into tiles that read as tiles, not as slabs:
         the whole point of 模块尺寸水平方向越小，小格子越像正方形 */
      if (aspect > 2.8) bad.push(tag + ' TILE-TOO-WIDE ' + aspect.toFixed(2));
      if (aspect < 0.55) bad.push(tag + ' TILE-TOO-THIN ' + aspect.toFixed(2));
      /* the ring is square from its width, which is its own column, the block's height, two tile
         heights or 170 — whichever of those is smallest */
      var expect = Math.min(want, sr.height, colsTr[0], 170);
      if (rb.width > want + 1) bad.push(tag + ' RING-OVER-TWO-TILES ' + Math.round(rb.width) + '>' + Math.round(want));
      if (rb.width < expect - 3) bad.push(tag + ' RING-UNDER-TWO-TILES ' + Math.round(rb.width) + '<' + Math.round(expect));
    } else if (row === 1 && aspect > 2.4) {
      bad.push(tag + ' TILE-TOO-WIDE ' + aspect.toFixed(2));
    } else {
      if (rb.width > want + 1) bad.push(tag + ' RING-OVER-TWO-TILES ' + Math.round(rb.width) + '>' + Math.round(want));
      if (rb.width < Math.min(want, room) - 3) {
        bad.push(tag + ' RING-UNDER-TWO-TILES ' + Math.round(rb.width) + '<' + Math.round(Math.min(want, room)));
      }
    }
    if (Math.abs(rb.width - rb.height) > 1) bad.push(tag + ' RING-NOT-SQUARE');
    /* all four cutting is not "the label is short at this scale", it is a divide the renderer
       should have refused: at 43px of tile the short label still loses its tail */
    if (cut) bad.push(tag + ' LABELS-CUT ' + cut + '/' + tiles.length);
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
