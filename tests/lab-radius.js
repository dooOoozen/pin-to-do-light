/* The colour lab is a row of <input type=color>, and the chip a user sees is drawn by a
   native ::-webkit-color-swatch pseudo-element that ignores its parent's radius — so a
   rounded material used to show square colour blocks. Read the pseudo-element's own
   computed radius rather than eyeballing it, once in a rounded material and once in the
   square one, and put the user's own material back afterwards.
   Like the other panel fixtures it defers a beat before touching the bridge. */
(function () {
  function note(s) { try { window.API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function settled(style) { return document.documentElement.dataset.style === style; }

  function read(tag) {
    var els = Array.prototype.slice.call(document.querySelectorAll('.pal-swatch'));
    if (!els.length) { note(tag + ' NO SWATCHES'); return; }
    var pairs = els.slice(0, 4).map(function (el) {
      return getComputedStyle(el).borderTopLeftRadius + '/' +
        getComputedStyle(el, '::-webkit-color-swatch').borderTopLeftRadius;
    });
    note(tag + ' swatches=' + els.length + ' host/chip = ' + pairs.join('  '));
  }

  function go(style) {
    return window.API.op({ type: 'settings:update', patch: { style: style } })
      .then(function () { return wait(150); })
      .then(function tick() { return settled(style) ? null : wait(140).then(tick); })
      .then(function () { return wait(260); })
      .then(function () { read(style); });
  }

  setTimeout(function () {
    window.API.getState().then(function (st) {
      var before = st.settings.style;
      var btn = document.querySelector('#btnSettings');
      if (btn) btn.click();
      return wait(800)
        .then(function () { return go('diner'); })
        .then(function () { return go('print'); })
        .then(function () { return window.API.op({ type: 'settings:update', patch: { style: before } }); })
        .then(function () { return wait(300); })
        .then(function () { note('restored ' + before); });
    });
  }, 900);
})();
