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
      var cols = {};
      panels.forEach(function (p) {
        var b = box(p);
        var key = Math.round(b.x);
        (cols[key] || (cols[key] = [])).push({ el: p, top: b.y, bottom: b.bottom,
          name: ((q('.panel h3', p) || {}).textContent || '').split(' /')[0] });
      });
      var worst = 0, worstAt = '', best = 1e9, stacked = 0;
      Object.keys(cols).forEach(function (k) {
        var list = cols[k].sort(function (a, b) { return a.top - b.top; });
        /* a column holding one panel proves nothing about spacing, so count the pairs found */
        stacked += Math.max(0, list.length - 1);
        for (var i = 1; i < list.length; i++) {
          var gap = list[i].top - list[i - 1].bottom;
          if (gap > worst) { worst = gap; worstAt = list[i - 1].name + ' → ' + list[i].name; }
          if (gap < best) best = gap;
        }
      });
      notes.push('columns=' + Object.keys(cols).length + ' pairs=' + stacked +
        ' gap=' + Math.round(best) + '..' + Math.round(worst));
      check(stacked >= 3, 'only ' + stacked + ' section pairs sit in a column, so the spacing check is vacuous');
      check(worst <= 14, 'a short section still leaves a ' + Math.round(worst) + 'px hole: ' + worstAt);
      check(best >= 4, 'sections are touching with no gap at all: ' + Math.round(best) + 'px');
      /* P1b — the columns must also *end* level. Every neighbour gap can be honest while one
         column still finishes 1127px below the other, which is what a single 1658px-tall
         section did to the balancer: it cannot move a piece it was never given. */
      var ends = Object.keys(cols).map(function (k) {
        var list = cols[k];
        return Math.round(Math.max.apply(null, list.map(function (x) { return x.bottom; })) -
          Math.min.apply(null, list.map(function (x) { return x.top; })));
      }).sort(function (a, b) { return b - a; });
      var spread = ends.length > 1 ? ends[0] - ends[ends.length - 1] : 0;
      notes.push('colHeights=' + ends.join('/') + ' spread=' + spread);
      check(ends.length < 2 || spread <= Math.max(120, Math.round(ends[0] * 0.12)),
        'the columns end ' + spread + 'px apart: ' + ends.join('/'));
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
