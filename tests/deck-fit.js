/* "卡盒大小改一下就变成长条，右侧时菜单按钮跑到屏幕外" — the slider is deckScale and the deck's box
   is content-driven, so the only way to know what leaves the screen is to walk the slider and
   measure. Two edges, the whole range, and both ends of the along-edge position, because a tall
   deck at the far end of the strip is a different failure from a wide one in the middle. The
   pointer is held on the deck throughout: the resting capsule measures 78px at every stop and
   would hide exactly what is being looked for. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[F] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function box(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) };
  }
  function off(b, w, h) {
    if (!b) return '-';
    var o = [];
    if (b.t < 0) o.push('top-' + (-b.t));
    if (b.b > h) o.push('bottom+' + (b.b - h));
    if (b.l < 0) o.push('left-' + (-b.l));
    if (b.r > w) o.push('right+' + (b.r - w));
    return o.length ? o.join(',') : 'inside';
  }
  function shot(tag) {
    var w = window.innerWidth, h = window.innerHeight;
    var d = box(document.getElementById('dock'));
    var f = box(document.getElementById('deckFace'));
    var tl = box(document.getElementById('dockTools'));
    var g = box(document.getElementById('groupChips'));
    var bad = off(d, w, h) !== 'inside' || off(tl, w, h) !== 'inside' || off(g, w, h) !== 'inside';
    note(tag + ' capsule=' + (document.body.classList.contains('deck-capsule') ? 'ON' : 'off') +
      ' area=' + w + 'x' + h +
      ' dock=' + (d ? (d.r - d.l) + 'x' + (d.b - d.t) + '@' + d.l + ',' + d.t : '-') +
      ' face=' + (f ? (f.r - f.l) + 'x' + (f.b - f.t) : '-') +
      ' tools=' + (tl ? (tl.r - tl.l) + 'x' + (tl.b - tl.t) : '-') +
      ' chips=' + (g ? (g.r - g.l) + 'x' + (g.b - g.t) : '-') +
      ' | dock=' + off(d, w, h) + ' tools=' + off(tl, w, h) + ' chips=' + off(g, w, h) +
      (bad ? '  <<<< OFF-SCREEN' : ''));
    return bad;
  }

  var was = {}, bad = [];
  var poke = setInterval(function () {
    var d = nd && nd.dockRect && nd.dockRect();
    if (d) nd.cursorCmd((d.left + d.right) / 2, (d.top + d.bottom) / 2, true);
  }, 110);

  function stop(edge, ds, pos) {
    return API.op({ type: 'settings:update', patch: { edge: edge, deckScale: ds, dockPos: pos } })
      .then(function () { return wait(650); })
      .then(function () { if (shot('edge=' + edge + ' ds=' + ds + ' pos=' + pos)) bad.push(edge + '/' + ds + '/' + pos); });
  }

  /* the primary display is the user's workspace, and this test drags the deck to every edge
     at three times its normal size — that belongs on the other screen */
  Promise.resolve(API.setDeckMonitor(1)).catch(function () { /* single-screen machine */ })
    .then(function () { return wait(1400); })
    .then(function () { return API.getState(); })
    .then(function (st) {
    was = { deckScale: st.settings.deckScale, edge: st.settings.edge, dockPos: st.settings.dockPos };
    nd.autoTuck(false); nd.tuck(false);
    return wait(400);
  }).then(function () {
    var chain = Promise.resolve();
    ['right', 'top'].forEach(function (edge) {
      [0.6, 1.0, 1.4, 1.8, 2.2, 2.5, 3].forEach(function (ds) {
        chain = chain.then(function () { return stop(edge, ds, 0.5); });
      });
      [0, 1].forEach(function (pos) {
        chain = chain.then(function () { return stop(edge, 3, pos); });
      });
    });
    return chain;
  }).then(function () {
    return API.op({ type: 'settings:update', patch: was });
  }).then(function () {
    clearInterval(poke);
    note('RESULT ' + (bad.length ? 'OFF-SCREEN at ' + bad.join(', ') : 'nothing leaves the work area at any stop') +
      ' (restored ' + JSON.stringify(was) + ')');
  }).catch(function (e) {
    clearInterval(poke);
    API.op({ type: 'settings:update', patch: was });
    note('RESULT ERROR ' + (e && e.message));
  });
})();
