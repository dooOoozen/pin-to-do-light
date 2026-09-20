/* The assembled dashboard, take 2: a corner grip that resizes a module to whole
   columns and whole rows, and the three panels whose contents had drifted off centre. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[H] ' + s); } catch (e) { /* no bridge */ } }
  function q(s) { return document.querySelector(s); }
  function qa(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function nav(t) { return qa('#navFilters button').filter(function (x) { return x.textContent.indexOf(t) >= 0; })[0]; }
  function R(el) { return el.getBoundingClientRect(); }
  function ptr(type, target, x, y) {
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 11, pointerType: 'mouse',
      button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y
    }));
  }
  function sizeOf(el) { return el.dataset.mod + '=' + (el.style.gridColumn || '?') + '/' + (el.style.gridRow || '?'); }

  nav('仪表盘').click();
  setTimeout(start, 900);

  function start() {
    var mods = qa('#dashGrid .mod');
    note('grips=' + qa('#dashGrid .mod-size').length + '/' + mods.length +
      ' tag=' + qa('#dashGrid .mod-size-tag').length +
      ' headH=' + Math.round(R(q('#modClock .mod-head')).height) +
      ' gripCursor=' + getComputedStyle(q('#modClock .mod-size')).cursor +
      ' sizes=' + mods.map(sizeOf).join(','));
    geometry();
  }

  /* the three panels that had drifted: heat cells, stat tiles, today ring */
  function geometry() {
    var body = R(q('#modHeat .mod-body'));
    var rows = R(q('.heat-rows'));
    var cell = R(q('.heat-year .heat-cell'));
    var cells = qa('.heat-year .heat-cell');
    note('heat rows=' + Math.round(rows.width) + 'x' + Math.round(rows.height) +
      ' cells=' + cells.length + ' cell=' + Math.round(cell.width) + 'x' + Math.round(cell.height) +
      ' gapL=' + Math.round(rows.left - body.left) + ' gapR=' + Math.round(body.right - rows.right) +
      ' deadB=' + Math.round(body.bottom - rows.bottom));
    var off = 0;
    qa('.pd-stats .stat').forEach(function (s) {
      var sr = R(s), vr = R(s.querySelector('.v'));
      if (Math.abs((sr.left + sr.right) / 2 - (vr.left + vr.right) / 2) > 3) off++;
    });
    note('statTiles=' + qa('.pd-stats .stat').length + ' offCentre=' + off +
      ' vFont=' + Math.round(parseFloat(getComputedStyle(q('.pd-stats .stat .v')).fontSize)) +
      ' statsH=' + Math.round(R(q('.pd-stats')).height));
    var ring = R(q('.today-ring'));
    var b = R(q('#modToday .mod-body'));
    note('ring=' + Math.round(ring.width) + 'x' + Math.round(ring.height) +
      ' square=' + (Math.abs(ring.width - ring.height) < 3) +
      ' midYoff=' + Math.round((ring.top + ring.height / 2) - (b.top + b.height / 2)) +
      ' figs=' + qa('.today-figs > div').length +
      ' figText=' + (q('.today-figs') || { textContent: '-' }).textContent.replace(/\s+/g, ' ').trim());
    resize();
  }

  /* drag the corner of the memo module out by one and a half columns and a row */
  function resize() {
    var mod = q('#modMemo');
    var grip = mod.querySelector('.mod-size');
    var before = sizeOf(mod);
    var mr = R(mod), gr = R(grip);
    var unit = (mr.width + 10) / 2;
    var rowH = (mr.height + 10) / 1;
    ptr('pointerdown', grip, gr.left + 7, gr.top + 7);
    ptr('pointermove', window, mr.left + unit * 4.4, mr.top + rowH * 1.6);
    setTimeout(function () {
      var live = sizeOf(mod) + ' tag=' + (mod.querySelector('.mod-size-tag') || { textContent: '-' }).textContent +
        ' sizing=' + mod.classList.contains('sizing');
      ptr('pointerup', window, mr.left + unit * 4.4, mr.top + rowH * 1.6);
      setTimeout(function () {
        note('resize ' + before + ' -> live[' + live + '] settled=' + sizeOf(mod));
        API.getState().then(function (st) {
          var dl = st.settings.dashLayout || {};
          note('saved memo span=' + (dl.span || {}).memo + ' row=' + (dl.row || {}).memo +
            ' all=' + qa('#dashGrid .mod').map(sizeOf).join(','));
          snapBack();
        });
      }, 500);
    }, 200);
  }

  /* a free drag that lands between two sizes has to snap, not sit there */
  function snapBack() {
    var mod = q('#modMemo');
    var grip = mod.querySelector('.mod-size');
    var mr = R(mod), gr = R(grip);
    var span = parseInt((mod.style.gridColumn || '').replace(/\D/g, ''), 10) || 2;
    var unit = (mr.width + 10) / span;
    ptr('pointerdown', grip, gr.left + 7, gr.top + 7);
    ptr('pointermove', window, mr.left + unit * 2.5, mr.top + unit * 0.2);
    ptr('pointerup', window, mr.left + unit * 2.5, mr.top + unit * 0.2);
    setTimeout(function () {
      var now = parseInt((mod.style.gridColumn || '').replace(/\D/g, ''), 10);
      note('snap 2.5 cols -> ' + now + ' allowed=' + ([2, 3, 4, 6].indexOf(now) >= 0) +
        ' row=' + (parseInt((mod.style.gridRow || '').replace(/\D/g, ''), 10) || 1));
      restore();
    }, 400);
  }

  function restore() {
    API.op({
      type: 'settings:update',
      patch: {
        dashLayout: {
          order: ['clock', 'stats', 'pomo', 'today', 'memo', 'heat', 'mini'],
          span: { clock: 2, stats: 4, pomo: 2, today: 2, memo: 2, heat: 3, mini: 3 },
          row: { clock: 1, stats: 1, pomo: 1, today: 1, memo: 1, heat: 1, mini: 1 }
        }
      }
    }).then(function () {
      return API.getState();
    }).then(function (st) {
      var dl = st.settings.dashLayout || {};
      note('restored span=' + JSON.stringify(dl.span) + ' row=' + JSON.stringify(dl.row));
      fill();
    });
  }

  function fill() {
    setTimeout(function () {
      var m = q('.main'), g = q('#dashGrid');
      var lowest = 0;
      qa('#dashGrid .mod').forEach(function (x) { if (R(x).bottom > lowest) lowest = R(x).bottom; });
      note('fill main=' + Math.round(R(m).height) + ' grid=' + Math.round(R(g).height) +
        ' deadBottom=' + Math.round(R(m).bottom - lowest) +
        ' scrolls=' + (m.scrollHeight > m.clientHeight + 2));
    }, 800);
  }
})();
