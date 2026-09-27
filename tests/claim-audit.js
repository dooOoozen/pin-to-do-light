/* What does the layer actually own while it is doing nothing? The report is "卡盒占面积太大了,
   经常误触", and the number that answers that is not the deck's size but the area the window
   region claims — every pixel in it is a pixel of desktop that stops answering clicks. So:
   walk the spans that were handed to SetWindowRgn, and name the node at the centre of each
   big one.

   Filed away on its own screen first: the primary display is the user's workspace, and the
   deck would otherwise sit on top of it while this runs. The push goes to the host only —
   settings.deckMonitor in the store is never touched, so the next real launch is where the
   user left it.

   The three stations matter separately: at rest (capsule wanted), tucked (the deck is already
   the small thing, so the capsule must be off), and untucked again — the moment the earlier
   build lost the pill forever, because the boot arm could land while the deck was filed away
   and nothing else ever asked. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[A] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function deckRect() {
    var d = document.querySelector('.deck');
    if (!d) return 'no-deck';
    var r = d.getBoundingClientRect();
    return Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top);
  }
  function dockShift() {
    var k = document.querySelector('.dock');
    if (!k) return '-';
    var r = k.getBoundingClientRect();
    return Math.round(r.left) + ',' + Math.round(r.top) + ' ' + getComputedStyle(k).transform;
  }
  function audit(tag, fresh) {
    var spans = (fresh ? null : nd.pushed()) || nd.shape();
    var hi = nd.hoverInfo();
    var cap = document.body.classList.contains('deck-capsule');
    if (!spans) { note(tag + ' no region (full window) tucked=' + hi.tucked + ' capsule=' + (cap ? 'ON' : 'off')); return { on: 0, cap: cap }; }
    /* The raw sum is not the number that matters twice over: a span the window has already
       dropped off the screen owns no desktop, and spans that overlap are only claimed once by
       the OS. So clip to the client box and take the exact union (sweep the unique y edges). */
    var W = innerWidth, H = innerHeight, raw = 0, boxes = [], big = [];
    spans.forEach(function (r) {
      raw += r.width * r.height;
      var l = Math.max(r.x, 0), t = Math.max(r.y, 0);
      var w = Math.max(0, Math.min(r.x + r.width, W) - l);
      var h = Math.max(0, Math.min(r.y + r.height, H) - t);
      if (w > 0 && h > 0) boxes.push({ l: l, t: t, r: l + w, b: t + h });
    });
    var ys = [], i;
    boxes.forEach(function (b) { ys.push(b.t); ys.push(b.b); });
    ys = ys.filter(function (v, k) { return ys.indexOf(v) === k; }).sort(function (a, b) { return a - b; });
    var on = 0;
    for (i = 0; i + 1 < ys.length; i++) {
      var band = ys[i + 1] - ys[i];
      var xs = boxes.filter(function (b) { return b.t <= ys[i] && b.b >= ys[i + 1]; })
        .map(function (b) { return [b.l, b.r]; }).sort(function (a, b) { return a[0] - b[0]; });
      var u = 0, xLo = -1, xHi = -1;
      xs.forEach(function (s) {
        if (xLo < 0) { xLo = s[0]; xHi = s[1]; return; }
        if (s[0] > xHi) { u += xHi - xLo; xLo = s[0]; xHi = s[1]; } else if (s[1] > xHi) xHi = s[1];
      });
      if (xLo >= 0) u += xHi - xLo;
      on += u * band;
    }
    big = boxes.filter(function (b) { return (b.r - b.l) * (b.b - b.t) > 20000; })
      .map(function (b) { return { x: b.l, y: b.t, width: b.r - b.l, height: b.b - b.t }; });
    note(tag + ' spans=' + spans.length + ' raw=' + Math.round(raw / 1000) + 'k on-screen=' +
      Math.round(on / 1000) + 'kpx (' + (on / (W * H) * 100).toFixed(2) + '% of ' + W + 'x' + H + ') mode=' + nd.mode() +
      ' tucked=' + hi.tucked + ' capsule=' + (cap ? 'ON' : 'off') + ' deck=' + deckRect() + ' dock=' + dockShift());
    big.forEach(function (r) {
      var cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      var n = document.elementFromPoint(cx, cy);
      note(tag + '  span ' + r.width + 'x' + r.height + '@' + r.x + ',' + r.y +
        ' -> ' + (n ? (n.id || n.className || n.tagName) : 'nothing') +
        ' op=' + (n ? getComputedStyle(n).opacity : '-'));
    });
    return { on: on, cap: cap };
  }
  var expanded = 0, atRest, inTuck, backOut;
  Promise.resolve(API.setDeckMonitor(1)).catch(function () { /* single-screen machine */ })
    .then(function () { return wait(1200); })
    /* The "before" reference is taken in the same run and the same units: drop the pill class,
       let the boxes grow, and build the region from them directly rather than waiting for the
       push, which still carries the pill spans. */
    .then(function () {
      nd.tuck(false);   /* autoTuck stays on: the resting state this audits IS the pill */
      document.body.classList.remove('deck-capsule');
      return wait(500);
    })
    .then(function () {
      expanded = audit('deck expanded (pill class off)', true).on;
      document.body.classList.add('deck-capsule');
      return wait(900);
    })
    .then(function () { atRest = audit('at rest'); nd.tuck(true); return wait(1600); })
    .then(function () { inTuck = audit('tucked'); nd.tuck(false); return wait(2000); })
    .then(function () { backOut = audit('untucked again'); nd.cursorCmd(20, 20, false); return wait(1400); })
    .then(function () {
      audit('pointer away');
      var ok = atRest.cap && !inTuck.cap && backOut.cap && backOut.on <= atRest.on &&
        atRest.on < expanded;
      note('RESULT ' + (ok ? 'PASS' : 'FAIL') +
        ' expanded=' + Math.round(expanded / 1000) + 'k' +
        ' rest=' + Math.round(atRest.on / 1000) + 'k/' + (atRest.cap ? 'pill' : 'full') +
        ' tucked=' + Math.round(inTuck.on / 1000) + 'k/' + (inTuck.cap ? 'pill' : 'full') +
        ' again=' + Math.round(backOut.on / 1000) + 'k/' + (backOut.cap ? 'pill' : 'full'));
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
