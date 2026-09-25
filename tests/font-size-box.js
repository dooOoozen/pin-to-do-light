/* 散步卡片的字号设置只管字。它以前也管盒子：deployW/deployH 里乘了 fontk()，所以拖动
   「散步卡片文字大小」会把每一张摊在桌上的卡片一起放大缩小——人只是想让它好读一点，结果
   整个布局挪了位。这里量的就是这条边界：字号必须变，盒子必须不动。
   The setting is written through the real op and put back exactly as found — the store is
   live user data, and this file has no business leaving it at 0.8. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[Z] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function card() {
    var all = [].slice.call(document.querySelectorAll('.todo-card'))
      .filter(function (c) { return !c.classList.contains('docked') && c.offsetWidth; });
    return all[0] || null;
  }
  function fontk() {
    return parseFloat(getComputedStyle(document.body).getPropertyValue('--fontk')) || 0;
  }
  function probe() {
    var c = card();
    if (!c) return null;
    var r = c.getBoundingClientRect();
    var t = c.querySelector('.card-title');
    return {
      w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
      font: getComputedStyle(t).fontSize,
      k: fontk()
    };
  }
  function setFont(k) { return API.op({ type: 'settings:update', patch: { cardFontScale: k } }); }

  var k0 = 0, big = null, small = null, fails = [];
  function check(name, ok, detail) {
    note((ok ? 'ok   ' : 'FAIL ') + name + ' · ' + detail);
    if (!ok) fails.push(name);
  }

  wait(900).then(function () {
    /* the box is read from a card, but the setting is on the document — at boot nothing is
       scattered yet, so asking a card for it is what made the first run die on a null */
    k0 = fontk();
    note('start --fontk=' + k0 + ' mode=' + document.body.dataset.mode);
    if (document.body.dataset.mode !== 'deployed') {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    }
    return wait(1200);
  }).then(function () {
    if (!card()) throw new Error('nothing scattered to measure');
    return setFont(1.6);
  }).then(function () {
    big = probe();
    return setFont(0.8);
  }).then(function () {
    return wait(500);
  }).then(function () {
    small = probe();
    return setFont(k0);
  }).then(function () {
    return wait(400);
  }).then(function () {
    var back = probe();
    check('the setting still changes the type',
      !!big && !!small && big.font !== small.font,
      'font @1.6=' + (big || {}).font + ' @0.8=' + (small || {}).font);
    /* the width is set by the layout and must be identical; the height is a minimum that
       content can still push past, so it is allowed a small residual — the bug being pinned
       here was 317 against 167, not 8 px */
    var dw = big && small ? Math.abs(big.w - small.w) : 1e9;
    var dh = big && small ? Math.abs(big.h - small.h) / Math.max(big.h, small.h) : 1;
    check('the card box does not move with it', dw < 1.5 && dh < 0.08,
      'box @1.6=' + (big || {}).w + 'x' + (big || {}).h + ' @0.8=' + (small || {}).w + 'x' + (small || {}).h +
      ' dW=' + dw.toFixed(1) + ' dH=' + (dh * 100).toFixed(1) + '%');
    check('the store is back where it was', Math.abs(back.k - k0) < 0.01, '--fontk ' + k0 + ' -> ' + back.k);
    note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(', ') : 'PASS'));
  }).catch(function (e) {
    note('RESULT ERROR ' + (e && e.message) + ' (restoring ' + k0 + ')');
    if (k0) setFont(k0);
  });
})();
