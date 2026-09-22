/* The material ids p3 and unp are gone, but every existing data file still holds them, so
   the only question worth asking is whether a saved "p3" comes back as a *painted* poster
   desk rather than as a string that happens to say poster. Checked by reading the rule the
   poster material alone sets, not by reading the setting back. */
(function () {
  function note(s) { try { window.API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function read(tag) {
    var head = document.querySelector('.hud-head') || document.querySelector('.mod-head');
    var cs = head ? getComputedStyle(head) : null;
    note(tag + ' attr=' + document.documentElement.dataset.style +
      ' theme=' + document.documentElement.dataset.theme +
      ' headBg=' + (cs ? cs.backgroundImage.slice(0, 46) : '-') +
      ' radius=' + (cs ? cs.borderTopLeftRadius : '-') +
      ' paper=' + getComputedStyle(document.body).backgroundColor);
  }

  setTimeout(function () {
    var was = null;
    window.API.getState().then(function (st) {
      was = st.settings.style;
      note('onDisk=' + was);
      return wait(400);
    }).then(function () {
      read('boot');
      /* and the other retired id, then put the user's own material back */
      return window.API.op({ type: 'settings:update', patch: { style: 'unp' } });
    }).then(function () { return wait(700); })
      .then(function () { read('viaOldUnp'); return window.API.getState(); })
      .then(function (st) {
        note('unpArrivesAs=' + st.settings.style);
        return window.API.op({ type: 'settings:update', patch: { style: was } });
      })
      .then(function () { return wait(700); })
      .then(function () { read('restored'); return window.API.getState(); })
      .then(function (st) { note('final=' + st.settings.style); });
  }, 1200);
})();
