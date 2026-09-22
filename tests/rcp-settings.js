/* The receipt schedule is three values that only mean something together, and the host
   refuses to arm the timer unless the time parses — so what matters here is not whether
   the panel renders but whether a write from it survives the reducer and the normaliser
   and comes back as the same triple. Read it back from disk (getState) rather than from
   the DOM, and put the user's own values and material back afterwards. */
(function () {
  function note(s) { try { window.API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function readBack(tag) {
    return window.API.getState().then(function (st) {
      var r = st.settings.receipt;
      note(tag + ' receipt=' + JSON.stringify(r));
      return r;
    });
  }

  function shown(tag) {
    var rows = document.querySelector('#rcpRows');
    var at = document.querySelector('.rcp-at');
    var host = document.querySelector('#panelReceipt');
    if (!host || !rows) { note(tag + ' NO PANEL'); return; }
    var cs = at ? getComputedStyle(at) : null;
    note(tag + ' panel=1 setRows=' + rows.querySelectorAll('.set-row').length +
      ' time=' + (at ? at.type + ':' + at.value : 'none') +
      ' radius=' + (cs ? cs.borderTopLeftRadius : '-') +
      ' bg=' + (cs ? cs.backgroundImage.slice(0, 34) : '-') +
      ' dir=' + (document.querySelector('#rcpDir') || {}).value +
      ' ph=' + ((document.querySelector('#rcpDir') || {}).placeholder || '').slice(-26) +
      ' use=' + !!document.querySelector('#rcpDirUse') +
      ' open=' + !!document.querySelector('#rcpDirOpen') +
      ' tag=' + ((document.querySelector('#rcpNow') || {}).textContent || ''));
  }

  setTimeout(function () {
    var before = null, beforeStyle = null;
    window.API.getState().then(function (st) {
      before = JSON.parse(JSON.stringify(st.settings.receipt));
      beforeStyle = st.settings.style;
      return window.API.receiptDir();
    }).then(function (p) {
      note('defaultDir=' + JSON.stringify(p));
      var btn = document.querySelector('#btnSettings');
      if (btn) btn.click();
      return wait(900);
    }).then(function () {
      shown('render');
      /* the schedule switch */
      var sw = document.querySelector('#rcpRows .switch');
      if (sw) sw.click();
      return wait(320).then(function () { return readBack('switch->on'); });
    }).then(function (r) {
      note('switch on=' + (r && r.on));
      /* the time field: type a real value and let the change handler write it */
      var at = document.querySelector('.rcp-at');
      if (at) {
        at.value = '07:45';
        at.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return wait(320).then(function () { return readBack('time'); });
    }).then(function (r) {
      note('time at=' + (r && r.at) + ' on=' + (r && r.on));
      /* a half-typed time must not arm the timer */
      var at = document.querySelector('.rcp-at');
      if (at) {
        at.value = '';
        at.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return wait(260).then(function () {
        /* 用这个 with a folder of our own, then read the triple back */
        var d = document.querySelector('#rcpDir');
        if (d) d.value = 'D:/work/scratch/rcp-dir-test';
        var use = document.querySelector('#rcpDirUse');
        if (use) use.click();
        return wait(360).then(function () { return readBack('dir'); });
      });
    }).then(function (r) {
      note('dir=' + (r && JSON.stringify(r.dir)) + ' on=' + (r && r.on));
      shown('after');
      /* the material decides the plate radius, so look at the same field twice */
      return window.API.op({ type: 'settings:update', patch: { style: 'diner' } });
    }).then(function () { return wait(700); })
      .then(function () {
        /* the panel was built once; re-open to re-style it */
        var close = document.querySelector('.modal [data-act="done"], .modal-foot [data-act="done"]');
        if (close) close.click();
        return wait(260);
      })
      .then(function () {
        var btn = document.querySelector('#btnSettings');
        if (btn) btn.click();
        return wait(900);
      })
      .then(function () { shown('diner'); })
      .then(function () {
        /* leave the user's data and material exactly as they were */
        return window.API.op({
          type: 'settings:update',
          patch: { receipt: before, style: beforeStyle }
        });
      })
      .then(function () { return wait(340); })
      .then(function () { return readBack('restored'); })
      .then(function (r) { note('restored ' + JSON.stringify(r) + ' style=' + beforeStyle); });
  }, 1000);
})();
