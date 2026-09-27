/* Two questions about the pill deck, both answered with the region the OS was handed:
   1. is it actually smaller? Sum the pushed spans after clipping each to the window and
      taking their exact union — raw sums double-count the overlapping deck boxes, and spans
      the window has dropped off the screen own no desktop at all.
   2. is it actually usable? The first pill showed nothing but a number, which is a
      decoration. So every tool button is probed with elementFromPoint at its own centre:
      whatever answers there has to be the button or something inside it.

   Both shapes are measured in one run, and the user's own setting is put back at the end.
   Filed away on the second display, because the primary one is their workspace. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[A] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function union(spans, W, H) {
    var boxes = [];
    spans.forEach(function (r) {
      var l = Math.max(r.x, 0), t = Math.max(r.y, 0);
      var w = Math.max(0, Math.min(r.x + r.width, W) - l);
      var h = Math.max(0, Math.min(r.y + r.height, H) - t);
      if (w > 0 && h > 0) boxes.push({ l: l, t: t, r: l + w, b: t + h });
    });
    var ys = [];
    boxes.forEach(function (b) { ys.push(b.t); ys.push(b.b); });
    ys = ys.filter(function (v, k) { return ys.indexOf(v) === k; }).sort(function (a, b) { return a - b; });
    var on = 0;
    for (var i = 0; i + 1 < ys.length; i++) {
      var band = ys[i + 1] - ys[i], u = 0, xLo = -1, xHi = -1;
      boxes.filter(function (b) { return b.t <= ys[i] && b.b >= ys[i + 1]; })
        .map(function (b) { return [b.l, b.r]; })
        .sort(function (a, b) { return a[0] - b[0]; })
        .forEach(function (s) {
          if (xLo < 0) { xLo = s[0]; xHi = s[1]; return; }
          if (s[0] > xHi) { u += xHi - xLo; xLo = s[0]; xHi = s[1]; } else if (s[1] > xHi) xHi = s[1];
        });
      if (xLo >= 0) u += xHi - xLo;
      on += u * band;
    }
    return on;
  }
  function claim() {
    var spans = nd.pushed() || nd.shape();
    if (!spans) return -1;
    return union(spans, innerWidth, innerHeight);
  }
  /* the pill has to carry the deck's controls, not just its number */
  function controls() {
    var missing = [];
    var simple = document.getElementById('toolSimple');
    if (!simple) missing.push('no #toolSimple');
    var list = simple ? [simple] : [];
    Array.prototype.forEach.call(document.querySelectorAll('.dock-tools .tool'), function (b) { list.push(b); });
    list.forEach(function (b) {
      var r = b.getBoundingClientRect();
      if (!r.width || !r.height) { missing.push((b.id || b.dataset.act || '?') + ':zero'); return; }
      var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(hit === b || b.contains(hit))) {
        missing.push((b.id || b.dataset.act || '?') + '->' + (hit ? (hit.className || hit.tagName) : 'nothing'));
      }
    });
    return missing;
  }
  function faceBox() {
    var r = document.getElementById('deckFace').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), s: Math.round(r.width) + 'x' + Math.round(r.height) };
  }
  function shape() { return document.body.classList.contains('deck-pill') ? 'pill' : 'stack'; }
  function set(v) { return API.op({ type: 'settings:update', patch: { deckShape: v } }).then(function () { return wait(1200); }); }

  var was, stackClaim = 0, pillClaim = 0, missing = [], rows = '', autoTucks = false;
  Promise.resolve(API.setDeckMonitor(1)).catch(function () { /* single-screen machine */ })
    .then(function () { return API.getState(); })
    /* the tuck shifts the whole dock by its own width minus 22px, so a control probe or an
       area measurement taken while it is tucked answers about pixels that are off screen */
    .then(function (st) { was = st.settings.deckShape; nd.autoTuck(false); nd.tuck(false); return wait(900); })
    .then(function () { return set('stack'); })
    .then(function () { stackClaim = claim(); note('stack  shape=' + shape() + ' face=' + faceBox().s + ' claim=' + Math.round(stackClaim / 1000) + 'kpx'); })
    .then(function () { return set('pill'); })
    .then(function () {
      pillClaim = claim();
      var f = faceBox();
      missing = controls();
      /* two lines, and narrower than the 297px single row it replaces */
      rows = f.s + (f.h >= 45 && f.w <= 240 ? ' two rows' : ' NOT two rows');
      note('pill   shape=' + shape() + ' face=' + f.s + ' claim=' + Math.round(pillClaim / 1000) + 'kpx' +
        ' controls=' + (missing.length ? 'MISSING ' + missing.join(',') : 'all reachable'));
      /* the pill must still file itself away on idle, like the stack always did */
      nd.autoTuck(true);
      nd.cursorFrame(40, 40, false);
      return wait(1800);
    })
    .then(function () {
      autoTucks = nd.hoverInfo().tucked === true;
      note('idle auto-tuck in pill = ' + autoTucks + ' (mode=' + nd.mode() + ')');
      /* and the shape must not move under the pointer any more — that was the whole argument */
      nd.autoTuck(false);
      nd.tuck(false);
      return wait(700);
    })
    .then(function () {
      var c = nd.dockRect();
      nd.cursorCmd((c.left + c.right) / 2, (c.top + c.bottom) / 2, true);
      return wait(700);
    })
    .then(function () {
      var held = shape() === 'pill';
      note('after hover shape=' + shape() + ' face=' + faceBox().s + ' mode=' + nd.mode());
      return set(was === undefined ? 'stack' : was).then(function () { return held; });
    })
    .then(function (held) {
      var ok = held && pillClaim > 0 && pillClaim < stackClaim / 2 && !missing.length &&
        autoTucks && rows.indexOf('two rows') > 0;
      note('RESULT ' + (ok ? 'PASS' : 'FAIL') + ' stack=' + Math.round(stackClaim / 1000) + 'k' +
        ' pill=' + Math.round(pillClaim / 1000) + 'k (x' + (stackClaim / Math.max(1, pillClaim)).toFixed(1) +
        ')' + ' pillFace=' + rows + ' idleTuck=' + autoTucks + ' pillStaysOnHover=' + held +
        ' restored=' + JSON.stringify(was));
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); if (was) API.op({ type: 'settings:update', patch: { deckShape: was } }); });
})();
