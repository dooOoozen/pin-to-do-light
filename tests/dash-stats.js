/* "界面缩放时，仪表盘这里的排版不对，格子有大有小的" — the four counters used to pick their
   column count from a @media rule on the window, so the same module at the same size changed
   layout when something else resized. Now the module's own width decides, which is what the
   container queries in dashboard.css are for.

   Walked across the interface scale (界面缩放) and both module widths, because the panel is
   resizable and the scale changes the panel's own px. Asserted per stop: the four tiles are
   the same width and the same height to within a pixel, none of them is clipped by the body,
   and the column count never *drops* as the module gets wider.

   The user's layout and scale are snapshotted and written back at the end. Runs on the second
   display — see tests/move-deck-2.js, which is the layer half of this pair. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[T] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var grid = document.getElementById('dashGrid') || document.querySelector('.dash-grid');
  var mod = document.getElementById('modStats');
  var body = mod.querySelector('.mod-body');
  var was = null;
  var bad = [];

  function tiles() {
    return Array.prototype.map.call(mod.querySelectorAll('.pd-stats .stat'), function (n) {
      var r = n.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
        right: Math.round(r.right), bottom: Math.round(r.bottom) };
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
    var n = columns(list);
    var line = tag + ' body=' + Math.round(b.width) + 'x' + Math.round(b.height) + ' tiles=' + list.length +
      ' cols=' + n + ' w=' + ws.join('/') + ' h=' + hs.join('/') +
      (dw > 1 ? ' WIDTH-SPREAD ' + dw : '') + (dh > 1 ? ' HEIGHT-SPREAD ' + dh : '') +
      (clipped ? ' CLIPPED ' + clipped : '');
    /* a module nobody can see measures nothing, and nothing is trivially equal to nothing:
       the first run of this test "passed" eight stops with zero tiles in them */
    if (b.width < 40 || list.length !== 4) bad.push(tag + ' NOT VISIBLE');
    /* equal is not enough: four columns in a narrow module is equal and unreadable, because
       the label has to stay on one line */
    else if (Math.min.apply(null, ws) < 108) bad.push(tag + ' tiles too narrow (' + Math.min.apply(null, ws) + ')');
    else if (dw > 1 || dh > 1 || clipped) bad.push(tag);
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

  if (!mod) { note('RESULT ERROR no #modStats'); return; }
  API.getState().then(function (st) {
    was = { uiScale: st.settings.uiScale, dashLayout: JSON.parse(JSON.stringify(st.settings.dashLayout || {})) };
    if (!toDash()) bad.push('no 仪表盘 button in #navFilters');
    /* the user may have folded any of these — a folded module is display:none and measures
       0x0, which is how the first run of this test reported four equal zero-width tiles */
    var open = JSON.parse(JSON.stringify(was.dashLayout));
    open.collapsed = [];
    var chain = set({ dashLayout: open });
    var prevWide = 0;
    [0.85, 1, 1.15, 1.35].forEach(function (sc) {
      [2, 4].forEach(function (span) {
        chain = chain.then(function () {
          var L = JSON.parse(JSON.stringify(was.dashLayout));
          L.span = L.span || {}; L.span.stats = span; L.collapsed = [];
          return set({ uiScale: sc, dashLayout: L });
        }).then(function () {
          var n = stop('scale=' + sc + ' span=' + span);
          if (span === 4 && n < prevWide) bad.push('columns dropped at span 4');
          if (span === 2) prevWide = n;
        });
      });
    });
    return chain;
  }).then(function () {
    return API.op({ type: 'settings:update', patch: { uiScale: was.uiScale, dashLayout: was.dashLayout } });
  }).then(function () {
    note('RESULT ' + (bad.length ? 'FAIL ' + bad.join(' | ') : 'PASS tiles stay equal across four scales and both widths') +
      ' (restored uiScale=' + was.uiScale + ')');
  }).catch(function (e) {
    if (was) API.op({ type: 'settings:update', patch: { uiScale: was.uiScale, dashLayout: was.dashLayout } });
    note('RESULT ERROR ' + (e && e.message));
  });
})();
