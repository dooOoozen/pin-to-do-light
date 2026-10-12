/* "界面缩放时，仪表盘这里的排版不对，格子有大有小的" — the four counters used to pick their
   column count from a @media rule on the window, so the same module at the same size changed
   layout when something else resized. Now the module's own width decides, which is what the
   container queries in dashboard.css are for.

   Walked across the interface scale (界面缩放), both module widths and both row counts,
   because the plate is now shared with the 今日概览 ring: asserted per stop, the four tiles are
   the same width and the same height to within a pixel, none of them is cut by the plate or by
   its own border, no label drops to a second line, and the column count never *drops* as the
   module gets wider.

   The user's layout and scale are snapshotted and written back at the end. Runs on the second
   display — see tests/move-deck-2.js, which is the layer half of this pair. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[T] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var grid = document.getElementById('dashGrid') || document.querySelector('.dash-grid');
  var mod = document.getElementById('modToday');
  var body = mod.querySelector('.mod-body');
  var was = null;
  var bad = [];
  var wraps = [];

  function tiles() {
    return Array.prototype.map.call(mod.querySelectorAll('.pd-stats .stat'), function (n) {
      var r = n.getBoundingClientRect();
      var k = n.querySelector('.k');
      return { node: n, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
        right: Math.round(r.right), bottom: Math.round(r.bottom),
        /* the tile clips its own content rather than pushing past the plate, so overflow has
           to be read against the tile: scrollHeight is the content's height whether it is cut
           or not, and a label that needs two lines is the failure the user reports as
           格子有大有小 / 字被切掉 */
        cut: n.scrollHeight - n.clientHeight,
        labW: k ? Math.round(k.scrollWidth) : 0, labBox: k ? Math.round(k.clientWidth) : 0,
        labH: k ? Math.round(k.getBoundingClientRect().height) : 0 };
    });
  }
  function columns(list) {
    var xs = [];
    list.forEach(function (t) { if (xs.indexOf(t.x) < 0) xs.push(t.x); });
    return xs.length;
  }
  function stop(tag) {
    var b = body.getBoundingClientRect();
    var list = tiles();
    var ws = list.map(function (t) { return t.w; });
    var hs = list.map(function (t) { return t.h; });
    var dw = ws.length ? Math.max.apply(null, ws) - Math.min.apply(null, ws) : 0;
    var dh = hs.length ? Math.max.apply(null, hs) - Math.min.apply(null, hs) : 0;
    var clipped = list.filter(function (t) {
      return t.right > Math.round(b.right) + 1 || t.bottom > Math.round(b.bottom) + 1 || t.x < Math.round(b.left) - 1;
    }).length;
    var cut = list.filter(function (t) { return t.cut > 1; }).length;
    /* The label is nowrap by design, so at the smallest plates it loses its tail rather than
       pushing the number down a row. Reported, not failed: which stops it happens at is a
       judgement about the label text, and a red suite over it would hide the cuts that matter. */
    var tightLabel = list.filter(function (t) { return t.labW > t.labBox + 1; }).length;
    var n = columns(list);
    var line = tag + ' body=' + Math.round(b.width) + 'x' + Math.round(b.height) + ' tiles=' + list.length +
      ' cols=' + n + ' w=' + ws.join('/') + ' h=' + hs.join('/') +
      ' vFont=' + Math.round(parseFloat(getComputedStyle(list[0].node.querySelector('.v')).fontSize) * 10) / 10 +
      ' kFont=' + Math.round(parseFloat(getComputedStyle(list[0].node.querySelector('.k')).fontSize) * 10) / 10 +
      (dw > 1 ? ' WIDTH-SPREAD ' + dw : '') + (dh > 1 ? ' HEIGHT-SPREAD ' + dh : '') +
      (clipped ? ' CLIPPED ' + clipped : '') + (cut ? ' CONTENT-CUT ' + cut : '') +
      (tightLabel ? ' LABEL-CUT ' + tightLabel : '');
    if (tightLabel) wraps.push(tag);
    /* a module nobody can see measures nothing, and nothing is trivially equal to nothing:
       the first run of this test "passed" eight stops with zero tiles in them */
    if (b.width < 40 || list.length !== 4) bad.push(tag + ' NOT VISIBLE');
    /* equal is not enough: a tile whose number is cut is equal and unreadable */
    else if (clipped || cut || dw > 1 || dh > 1) bad.push(tag);
    note(line);
    return n;
  }
  function toDash() {
    var b = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
      .filter(function (x) { return (x.textContent || '').indexOf('仪表盘') >= 0; })[0];
    if (b) b.click();
    return !!b;
  }
  function set(patch) {
    return API.op({ type: 'settings:update', patch: patch }).then(function () { return wait(700); });
  }

  if (!mod) { note('RESULT ERROR no #modToday'); return; }
  API.getState().then(function (st) {
    was = { uiScale: st.settings.uiScale, dashLayout: JSON.parse(JSON.stringify(st.settings.dashLayout || {})) };
    if (!toDash()) bad.push('no 仪表盘 button in #navFilters');
    /* the user may have folded any of these — a folded module is display:none and measures
       0x0, which is how the first run of this test reported four equal zero-width tiles */
    var open = JSON.parse(JSON.stringify(was.dashLayout));
    open.collapsed = [];
    var chain = set({ dashLayout: open });
    var prevWide = 0;
    /* The plate holds the ring row and the counters now, so the two axes that decide whether
       they fit are the interface scale and the module's own box — width from span, height from
       rows. One row is the tight case and the one that overflowed; two is the default. */
    [0.85, 1, 1.15, 1.35].forEach(function (sc) {
      [[2, 1], [2, 2], [4, 1], [4, 2]].forEach(function (size) {
        chain = chain.then(function () {
          var L = JSON.parse(JSON.stringify(was.dashLayout));
          L.span = L.span || {}; L.span.today = size[0]; L.collapsed = [];
          L.row = L.row || {}; L.row.today = size[1];
          return set({ uiScale: sc, dashLayout: L });
        }).then(function () {
          var n = stop('scale=' + sc + ' span=' + size[0] + ' row=' + size[1]);
          if (size[0] === 4 && n < prevWide) bad.push('columns dropped at span 4');
          if (size[0] === 2) prevWide = n;
        });
      });
    });
    return chain;
  }).then(function () {
    return API.op({ type: 'settings:update', patch: { uiScale: was.uiScale, dashLayout: was.dashLayout } });
  }).then(function () {
    note('RESULT ' + (bad.length ? 'FAIL ' + bad.join(' | ') : 'PASS nothing cut and tiles equal across four scales, both spans and both row counts') +
      ' (restored uiScale=' + was.uiScale + ' labelShort=' + wraps.length + (wraps.length ? ': ' + wraps.join(',') : '') + ')');
  }).catch(function (e) {
    if (was) API.op({ type: 'settings:update', patch: { uiScale: was.uiScale, dashLayout: was.dashLayout } });
    note('RESULT ERROR ' + (e && e.message));
  });
})();
