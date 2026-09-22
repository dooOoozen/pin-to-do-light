/* Batch O, panel side: the two new switches have to exist, write through the reducer, and
   the titlebar mute button has to agree with the settings row. Also checks the ink rule
   that fixes the unreadable DECK band without touching the user's own group colours. */
(function () {
  function note(s) { try { window.API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function q(s) { return document.querySelector(s); }

  setTimeout(function () {
    var before = null;
    window.API.getState().then(function (st) {
      before = { simple: st.settings.simple, muted: st.settings.muted };
      note('start simple=' + st.settings.simple + ' muted=' + st.settings.muted +
        ' sound=' + st.settings.sound);
      var mute = q('#btnMute');
      note('muteBtn=' + !!mute + ' cls=' + (mute ? mute.className : '-') + ' ch=' + (mute ? mute.textContent : '-'));
      if (mute) mute.click();
      return wait(400);
    }).then(function () { return window.API.getState(); })
      .then(function (st) {
        note('afterMuteClick muted=' + st.settings.muted + ' flag=' + window.__uiMuted +
          ' cls=' + (q('#btnMute') ? q('#btnMute').className : '-'));
        var btn = q('#btnSettings');
        if (btn) btn.click();
        return wait(900);
      })
      .then(function () {
        var rows = Array.prototype.map.call(document.querySelectorAll('#panelToggles .set-label'),
          function (e) { return e.textContent; });
        note('toggles=' + rows.join(' | '));
        var sw = Array.prototype.filter.call(document.querySelectorAll('#panelToggles .set-row'),
          function (r) { return r.textContent.indexOf('简化卡片') >= 0; })[0];
        note('simpleRowFound=' + !!sw);
        if (sw) sw.querySelector('.switch').click();
        return wait(500);
      })
      .then(function () { return window.API.getState(); })
      .then(function (st) {
        note('afterSimpleToggle simple=' + st.settings.simple);
        /* the ink rule, checked against the palette rather than against the user's groups */
        note('inkOn cream=' + window.NeonTheme.inkOn('#f9efde') +
          ' inkOn brick=' + window.NeonTheme.inkOn('#8d3a27') +
          ' inkOn honey=' + window.NeonTheme.inkOn('#eba93a') +
          ' inkOn junk=' + window.NeonTheme.inkOn('nope'));
        var done = q('.modal-panel [data-act="done"]');
        if (done) done.click();
        return wait(300);
      })
      .then(function () {
        return window.API.op({ type: 'settings:update', patch: { simple: before.simple, muted: before.muted } });
      })
      .then(function () { return wait(400); })
      .then(function () { return window.API.getState(); })
      .then(function (st) { note('restored simple=' + st.settings.simple + ' muted=' + st.settings.muted); })
      .catch(function (e) { note('ERR ' + (e && e.message ? e.message : e)); });
  }, 1200);
})();
