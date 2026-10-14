/* Three things the screenshots caught, measured rather than eyeballed.

   P1  The settings sections used to be a two-column grid, and a grid row is as tall as its
       tallest member — so a short section left a hole under itself as big as the height
       difference. Now they flow by column, so the only vertical space is the declared one.
       Measured: the gap between one section's bottom edge and the next one below it.

   P2  The assign popover grew a third control and the name field collapsed to nothing,
       because .input was allowed to shrink to zero beside a select with an intrinsic width.
       Measured: the field's own box, not that it exists.

   P3  The timeline's date jump was a bare native field — no .input class — so it painted
       white-on-beige with the OS font while everything around it wore the material.
       Measured: its computed background and border against the material's own tokens.

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/settings-fit.js */
(function () {
  var API = window.API;
  var fails = [], notes = [];
  function note(s) { try { API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function check(ok, label) { if (!ok) fails.push(label); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function q(sel, root) { return (root || document).querySelector(sel); }
  function box(el) { var b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, bottom: b.bottom }; }
  function css(el, prop) { return getComputedStyle(el).getPropertyValue(prop).trim(); }

  function navTo(text) {
    var b = Array.prototype.slice.call(document.querySelectorAll('button')).filter(function (x) {
      return (x.textContent || '').indexOf(text) >= 0 && (x.textContent || '').indexOf('时间线') < 0;
    })[0];
    if (b) b.click();
    return !!b;
  }

  Promise.resolve()
    .then(function () { document.getElementById('btnSettings').click(); return wait(1000); })
    /* ---- P1: no holes between sections ---- */
    .then(function () {
      var grid = q('.settings-grid');
      check(!!grid, 'no .settings-grid');
      if (!grid) return null;
      var panels = Array.prototype.slice.call(grid.querySelectorAll('.panel'));
      check(panels.length >= 6, 'only ' + panels.length + ' settings sections rendered');
      /* P1a — the colour lab is ONE band that spans the sheet's columns, with its sections
         inside it. Broken out into loose sections it balanced to 4px apart and scattered one
         screen across the whole sheet, which is the other half of what was asked for. */
      var band = q('.pal-band', grid);
      check(!!band, 'no .pal-band — the lab is loose sections again');
      var inBand = band ? Array.prototype.slice.call(band.querySelectorAll('.panel')) : [];
      var lab = Array.prototype.slice.call(grid.querySelectorAll('#panelStyle, #panelPalette, .pal-panel'));
      check(lab.length >= 6, 'only ' + lab.length + ' lab sections rendered');
      check(!!band && lab.every(function (p) { return band.contains(p); }),
        'lab sections outside the band: ' + lab.filter(function (p) { return !band || !band.contains(p); })
          .map(function (p) { return ((q('h3', p) || {}).textContent || '?').trim().split(' /')[0]; }).join(','));
      if (band) {
        var bw = box(band), gw = box(grid);
        notes.push('band=' + Math.round(bw.w) + '/' + Math.round(gw.w));
        check(bw.w >= gw.w - 12, 'the lab band is ' + Math.round(bw.w) + 'px across a ' +
          Math.round(gw.w) + 'px sheet, so it does not span the columns');
      }
      /* The two flows are measured apart: the sheet's columns above and below the band, and the
         band's own columns inside it. Keyed by x they would mix and the ranges would be nonsense —
         and a column set that starts *under* the band is not a 1650px hole in the one above it. */
      function flow(list, label, tol) {
        var cols = {};
        list.forEach(function (p) {
          var b = box(p);
          /* a section that spans the flow is not a piece of any column in it */
          var key = p.classList.contains('band-span') ? 'span' : Math.round(b.x);
          if (key === 'span') return;
          (cols[key] || (cols[key] = [])).push({ top: b.y, bottom: b.bottom,
            name: ((q('.panel h3', p) || {}).textContent || '').split(' /')[0] });
        });
        var worst = 0, worstAt = '', best = 1e9, stacked = 0;
        Object.keys(cols).forEach(function (k) {
          var one = cols[k].sort(function (a, b) { return a.top - b.top; });
          stacked += Math.max(0, one.length - 1);
          for (var i = 1; i < one.length; i++) {
            var gap = one[i].top - one[i - 1].bottom;
            if (gap > worst) { worst = gap; worstAt = one[i - 1].name + ' → ' + one[i].name; }
            if (gap < best) best = gap;
          }
        });
        var ends = Object.keys(cols).map(function (k) {
          var one = cols[k];
          return Math.round(Math.max.apply(null, one.map(function (x) { return x.bottom; })) -
            Math.min.apply(null, one.map(function (x) { return x.top; })));
        }).sort(function (a, b) { return b - a; });
        var spread = ends.length > 1 ? ends[0] - ends[ends.length - 1] : 0;
        notes.push(label + ': cols=' + ends.length + ' gap=' + Math.round(best) + '..' +
          Math.round(worst) + ' heights=' + ends.join('/') + ' spread=' + spread);
        check(stacked >= 1, label + ': only ' + stacked + ' section pairs sit in a column, so the spacing check is vacuous');
        check(!list.length || worst <= 14, label + ': a short section leaves a ' +
          Math.round(worst) + 'px hole: ' + worstAt);
        check(!list.length || best >= 4, label + ': sections touch with no gap: ' + Math.round(best) + 'px');
        /* P1b — the columns must also *end* level. Every neighbour gap can be honest while one
           column still finishes 1127px below the other, which is what a single 1658px-tall
           section did to the balancer: it cannot move a piece it was never given. The tolerance
           is not tighter than a quarter because the fill is sequential and sections are not
           split — with pieces of 553/244/616 the best available split is 797 against 616. What
           the report was about is a column ending a screen away from its neighbour. */
        check(ends.length < 2 || spread <= Math.max(120, Math.round(ends[0] * tol)),
          label + ': the columns end ' + spread + 'px apart: ' + ends.join('/'));
      }
      var outer = panels.filter(function (p) { return !band || !band.contains(p); });
      var above = [], below = [];
      if (band) {
        var bandTop = box(band).y;
        outer.forEach(function (p) { (box(p).y < bandTop ? above : below).push(p); });
      } else {
        above = outer;
      }
      flow(above, 'sheet-above', 0.25);
      flow(below, 'sheet-below', 0.25);
      flow(inBand, 'band', 0.25);
      /* P1c — and nothing may be painted past its own section. The 关于 row put a
         44-character URL and two buttons on one line: 430px of content in a 306px column. */
      panels.forEach(function (p) {
        var h3 = q('.panel h3', p);
        var name = ((h3 && h3.textContent) || '?').trim().slice(0, 12);
        check(p.scrollWidth <= p.clientWidth + 1,
          'section overflows its column: ' + name + ' ' + p.scrollWidth + '>' + p.clientWidth);
        var past = Array.prototype.slice.call(p.querySelectorAll('*')).filter(function (n) {
          var r = n.getBoundingClientRect(), pr = p.getBoundingClientRect();
          return r.width > 0 && r.right > pr.right + 1;
        });
        check(!past.length, 'drawn outside its section: ' + name + ' x' + past.length);
      });
      document.querySelector('.modal-backdrop, [data-act="cancel"]').click();
      return wait(600);
    })
    /* ---- P2: the assign popover ---- */
    .then(function () {
      check(navTo('时间轴'), 'no 时间轴 button');
      return wait(1200);
    })
    .then(function () {
      var col = q('.tk-col');
      check(!!col, 'no .tk-col');
      if (!col) return null;
      var r = col.getBoundingClientRect();
      var x = r.left + r.width / 2, y0 = r.top + 20, y1 = r.top + 130;
      function pe(type, y, target) {
        (target || col).dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerId: 9, isPrimary: true, clientX: x, clientY: y
        }));
      }
      pe('pointerdown', y0);
      pe('pointermove', y0 + 40, document);
      pe('pointermove', y1, document);
      pe('pointerup', y1, document);
      return wait(700);
    })
    .then(function () {
      var pop = q('.tk-pop');
      check(!!pop, 'the assign popover did not open');
      if (!pop) return null;
      var input = q('[data-tk="new"]', pop), grp = q('[data-tk="grp"]', pop), go = q('[data-tk="go"]', pop);
      var bi = box(input), bg = box(grp), bo = box(go);
      notes.push('input=' + Math.round(bi.w) + 'x' + Math.round(bi.h) +
        ' grp=' + Math.round(bg.w) + 'x' + Math.round(bg.h) + ' go=' + Math.round(bo.w));
      check(bi.w >= 120, 'the task-name field is only ' + Math.round(bi.w) + 'px wide — it is being squeezed out');
      check(bi.h >= 16, 'the task-name field is ' + Math.round(bi.h) + 'px tall');
      check(!!grp && bg.w >= 60, 'the group select is missing or collapsed: ' + Math.round(bg && bg.w));
      check(Math.abs(bi.y - bg.y) > 4, 'the name field and the group select are on the same row again');
      check(bo.w >= 28 && Math.abs(bo.y - bg.y) <= 4, '确定 is not beside the group select');
      /* typing a name and confirming must still work from this layout */
      input.value = 'ZZ 弹框布局测试';
      go.click();
      return wait(900);
    })
    /* ---- P3: the date field wears the material ---- */
    .then(function () {
      var jump = q('#tkJump');
      check(!!jump, 'no #tkJump on the timeline nav');
      if (!jump) return null;
      var root = document.documentElement;
      var want = css(root, '--paper-hi') || css(root, '--paper');
      var bj = box(jump);
      notes.push('jump=' + Math.round(bj.w) + 'x' + Math.round(bj.h) +
        ' bg=' + css(jump, 'background-color') + ' border=' + css(jump, 'border-top-width') +
        ' scheme=' + css(jump, 'color-scheme'));
      check(bj.w >= 80 && bj.h >= 16, 'the date field is ' + Math.round(bj.w) + 'x' + Math.round(bj.h));
      check(jump.classList.contains('input'), 'the date field does not carry the .input class');
      check(css(jump, 'border-top-width') !== '0px', 'the date field has no border, so it is not on the material');
      check(/2|oklch|rgb/.test(css(jump, 'color-scheme')) === false ||
            css(jump, 'color-scheme') !== 'normal', 'the date field has no color-scheme, so its picker ignores night mode');
      return API.getState();
    })
    .then(function (st) {
      var made = (st.todos || []).filter(function (t) { return t.title === 'ZZ 弹框布局测试'; });
      check(made.length === 1, 'the popover did not create the task: ' + made.length);
      return Promise.all(made.map(function (t) {
        return API.op({ type: 'todo:delete', id: t.id }).catch(function () {})
          .then(function () { return API.op({ type: 'trash:purge', id: t.id }).catch(function () {}); });
      }));
    })
    .then(function () { return API.getState(); })
    .then(function (st) {
      var zz = st.todos.concat((st.trash || []).map(function (x) { return x.todo; }))
        .filter(function (t) { return /^ZZ /.test(t.title); }).length;
      note('cleanup zzLeft=' + zz);
      check(zz === 0, 'left ' + zz + ' test tasks behind');
    })
    .catch(function (e) { fails.push('threw: ' + (e && e.message)); })
    .then(function () {
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS') + ' ' + notes.join(' | '));
    });
})();
