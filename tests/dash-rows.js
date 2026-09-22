/* Two dashboard complaints that cannot be settled by reading the code.
   (a) A module pulled to 3 rows goes back to 2. The grip writes the DOM, persist() writes
       the state and applyDashLayout() re-applies the state — so the question is *which* of
       those three is lying, and when. Sampled at four delays through the round trip.
   (b) A white square at the bottom-right of the heat module. elementFromPoint names the
       node and its computed background at a grid of probe points, at two module sizes,
       which is a better answer than guessing whether it is a clipped cell, the resize grip
       or the module's own plate. */
(function () {
  function note(s) { try { window.API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function id(x) { return document.getElementById(x); }

  function probeHeat(tag) {
    var mod = document.querySelector('[data-mod="heat"]');
    if (!mod) { note(tag + ' NO HEAT'); return; }
    var body = mod.querySelector('.mod-body');
    var grid = mod.querySelector('.heat-rows');
    var mb = body.getBoundingClientRect();
    var rows = grid.querySelectorAll('.heat-row');
    var last = rows.length ? rows[rows.length - 1].querySelector('.hr-cells') : null;
    note(tag + ' mod=' + Math.round(mb.width) + 'x' + Math.round(mb.height) +
      ' gridW=' + Math.round(grid.getBoundingClientRect().width) +
      ' bodyScroll=' + body.scrollWidth + '/' + body.clientWidth +
      ' rows=' + rows.length +
      ' lastRowCells=' + (last ? last.children.length : '-') +
      ' gridBottomPast=' + Math.round(grid.getBoundingClientRect().bottom - mb.bottom));
    var pts = [[-4, -4], [-10, -10], [-24, -14], [-40, -22], [-70, -30], [-4, -40], [-120, -12]];
    pts.forEach(function (p) {
      var x = mb.right + p[0], y = mb.bottom + p[1];
      var el = document.elementFromPoint(x, y);
      var cs = el ? getComputedStyle(el) : null;
      note(tag + ' @' + p[0] + ',' + p[1] + ' -> ' +
        (el ? (el.tagName + '.' + String(el.className).split(' ')[0]) : 'null') +
        (cs ? ' bg=' + cs.backgroundColor + ' op=' + cs.opacity : ''));
    });
  }

  function rowOf(mod) { return (mod.style.gridRow || '').replace(/\D/g, '') || '-'; }

  setTimeout(function () {
    var before = null;
    window.API.getState().then(function (st) {
      before = JSON.parse(JSON.stringify(st.settings.dashLayout || null));
      var nav = Array.prototype.filter.call(document.querySelectorAll('#navFilters button'), function (b) {
        return b.textContent.indexOf('仪表盘') >= 0;
      })[0];
      if (nav && !nav.classList.contains('on')) nav.click();
      return wait(900);
    }).then(function () {
      probeHeat('heat@default');
      /* drag the first module's grip down by exactly three rows' worth */
      var mod = document.querySelector('#dashGrid .mod');
      var grip = mod.querySelector('.mod-size');
      var r = mod.getBoundingClientRect();
      var g = id('dashGrid');
      var unitH = (r.height + 10) / Number(rowOf(mod) || 1);
      note('module=' + mod.dataset.mod + ' row=' + rowOf(mod) + ' unitH=' + Math.round(unitH));
      grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: r.right - 4, clientY: r.bottom - 4 }));
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.right + 40, clientY: r.bottom + unitH * 2 }));
      note('duringDrag row=' + rowOf(mod));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return wait(60);
    }).then(function () {
      var mod = document.querySelector('#dashGrid .mod');
      note('afterUp+60 row=' + rowOf(mod));
      return wait(240);
    }).then(function () {
      var mod = document.querySelector('#dashGrid .mod');
      note('afterUp+300 row=' + rowOf(mod));
      return window.API.getState();
    }).then(function (st) {
      note('state+300 row=' + JSON.stringify(st.settings.dashLayout && st.settings.dashLayout.row));
      return wait(900);
    }).then(function () {
      var mod = document.querySelector('#dashGrid .mod');
      note('afterUp+1200 row=' + rowOf(mod) + ' gridScroll=' + id('dashGrid').scrollHeight + '/' + id('dashGrid').clientHeight);
      return window.API.getState();
    }).then(function (st) {
      note('state+1200 row=' + JSON.stringify(st.settings.dashLayout && st.settings.dashLayout.row));
      /* now make the heat module 2x1 and probe again */
      var heat = document.querySelector('[data-mod="heat"]');
      heat.style.gridColumn = 'span 2';
      heat.style.gridRow = 'span 1';
      return wait(500).then(function () { probeHeat('heat@2x1'); });
    }).then(function () {
      var heat = document.querySelector('[data-mod="heat"]');
      heat.style.gridColumn = 'span 3';
      heat.style.gridRow = 'span 2';
      return wait(500).then(function () { probeHeat('heat@3x2'); });
    }).then(function () {
      return window.API.op({ type: 'settings:update', patch: { dashLayout: before } });
    }).then(function () { return wait(600); })
      .then(function () { return window.API.getState(); })
      .then(function (st) { note('restored ' + JSON.stringify(st.settings.dashLayout)); })
      .catch(function (e) { note('ERR ' + (e && e.message ? e.message : e)); });
  }, 1200);
})();
