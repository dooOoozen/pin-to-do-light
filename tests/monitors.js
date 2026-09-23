/* The display picker has to answer two different machines: one screen gets a sentence,
   two get buttons. Asks the host what it actually sees, then checks the row it renders and
   that moving the deck really moves the layer window onto that monitor's work area. */
(function () {
  function note(s) { try { window.API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  setTimeout(function () {
    var before = null;
    window.API.monitors().then(function (r) {
      note('monitors=' + JSON.stringify((r.monitors || []).map(function (m) {
        return [m.index, m.width + 'x' + m.height, m.x + ',' + m.y, m.scale, m.primary ? 'P' : '-', m.name || '?'];
      })));
      return window.API.getState();
    }).then(function (st) {
      before = st.settings.deckMonitor;
      note('deckMonitor setting=' + before);
      var btn = document.querySelector('#btnSettings');
      if (btn) btn.click();
      return wait(1000);
    }).then(function () {
      var row = document.querySelector('.mon-row');
      note('row=' + !!row + ' buttons=' + (row ? row.querySelectorAll('.btn').length : 0) +
        ' text=' + (row ? row.textContent.replace(/\s+/g, ' ').slice(0, 90) : '-') +
        ' primary=' + (row ? row.querySelectorAll('.btn.primary').length : 0));
      var list = document.querySelectorAll('.mon-row .btn');
      if (list.length > 1) list[list.length - 1].click();
      return wait(1200);
    }).then(function () { return window.API.getState(); })
      .then(function (st) {
        note('afterClick deckMonitor=' + st.settings.deckMonitor);
        return window.API.workArea();
      })
      .then(function (wa) {
        note('workArea now=' + JSON.stringify(wa) + ' inner=' + window.innerWidth + 'x' + window.innerHeight);
        var back = document.querySelectorAll('.mon-row .btn')[0];
        if (back) back.click();
        return wait(1200);
      })
      .then(function () { return window.API.getState(); })
      .then(function (st) {
        note('backTo=' + st.settings.deckMonitor);
        return window.API.op({ type: 'settings:update', patch: { deckMonitor: before } });
      })
      .then(function () { return wait(900); })
      .then(function () { return window.API.getState(); })
      .then(function (st) { note('restored deckMonitor=' + st.settings.deckMonitor); })
      .catch(function (e) { note('ERR ' + (e && e.message ? e.message : e)); });
  }, 1200);
})();
