/* Two things the user reported about the dashboard: the wheel must scroll without a
   visible bar, and the size grip capped at 2 rows. Neither needs a screenshot: a classic
   scrollbar costs the scroller real width (clientWidth < offsetWidth), the grid's own
   scrollHeight says whether the bottom rows are reachable, and the grip can be driven to
   its cap with synthetic pointer events. Restores the layout it disturbs. */
(function () {
  function note(s) { try { window.API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function id(x) { return document.getElementById(x); }

  function bar(tag, g) {
    var cs = getComputedStyle(g);
    note(tag + ' overflowY=' + cs.overflowY + ' bar=' + cs.scrollbarWidth +
      ' webkit=' + getComputedStyle(g, '::-webkit-scrollbar').width +
      ' client/offset=' + g.clientWidth + '/' + g.offsetWidth);
  }

  setTimeout(function () {
    var before = null;
    window.API.getState().then(function (st) {
      before = st.settings.dashLayout ? JSON.parse(JSON.stringify(st.settings.dashLayout)) : null;
      var nav = Array.prototype.filter.call(document.querySelectorAll('#navFilters button'), function (b) {
        return b.textContent.indexOf('仪表盘') >= 0;
      })[0];
      if (!nav) { note('NO NAV'); return; }
      if (!nav.classList.contains('on')) nav.click();
      return wait(800);
    }).then(function () {
      var g = id('dashGrid');
      if (!g) { note('NO GRID'); return; }
      bar('grid', g);
      note('grid box=' + Math.round(g.getBoundingClientRect().height) + ' content=' + g.scrollHeight +
        ' autoRows=' + getComputedStyle(g).gridAutoRows + ' mods=' + g.querySelectorAll('.mod').length +
        ' grips=' + g.querySelectorAll('.mod-size').length);
      g.scrollTop = 3000;
      note('setScroll(3000) -> ' + g.scrollTop + ' max=' + (g.scrollHeight - g.clientHeight));
      g.scrollTop = 0;
      var mod = g.querySelector('.mod');
      var grip = mod.querySelector('.mod-size');
      if (!grip) { note('NO GRIP'); return; }
      var r = mod.getBoundingClientRect();
      grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: r.right - 4, clientY: r.bottom - 4 }));
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.right + 260, clientY: r.bottom + 3000 }));
      note('dragSays row=' + mod.style.gridRow + ' tag=' + (mod.querySelector('.mod-size-tag') || {}).textContent);
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return wait(700);
    }).then(function () { return window.API.getState(); })
      .then(function (st) {
        note('savedRows=' + JSON.stringify(st.settings.dashLayout && st.settings.dashLayout.row));
        var g = id('dashGrid');
        g.scrollTop = 4000;
        note('afterResize scroll=' + g.scrollTop + '/' + (g.scrollHeight - g.clientHeight) + ' content=' + g.scrollHeight);
        g.scrollTop = 0;
        bar('after', g);
        return window.API.op({ type: 'settings:update', patch: { dashLayout: before } });
      })
      .then(function () { return wait(600); })
      .then(function () { return window.API.getState(); })
      .then(function (st) {
        var g = id('dashGrid');
        note('restoredRows=' + JSON.stringify(st.settings.dashLayout && st.settings.dashLayout.row) +
          ' content=' + g.scrollHeight + ' max=' + (g.scrollHeight - g.clientHeight));
      });
  }, 1200);
})();
