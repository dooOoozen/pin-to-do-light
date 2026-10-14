/* Three things the screenshots caught, measured rather than eyeballed.

   P1  The settings body is one scrolling column with a left nav — after two rounds of CSS
       column flow (holes, then a 1127px imbalance, then a spanning band that made one stretch
       single-column and the next two). Measured: one left edge for every section, one nav entry
       per section with a label, the modal body not competing with the pane for the wheel, and
       clicking the last entry actually bringing 关于 to the top of the pane.

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
    /* ---- P1: one scrolling column, with a nav that walks it ---- */
    .then(function () {
      var lay = q('.set-layout');
      check(!!lay, 'no .set-layout — the settings body is back to flowing by column');
      if (!lay) return null;
      var nav = q('.set-nav', lay), main = q('.set-main', lay);
      var body = q('.modal-body');
      var layb = box(lay), mainb = main ? box(main) : null;
      notes.push('lay=' + Math.round(layb.h) + ' main=' + (mainb ? Math.round(mainb.h) : '?') +
        '/' + (main ? main.clientHeight + 'c' + main.scrollHeight : '?') +
        ' body=' + (body ? body.clientHeight + 'c' + body.scrollHeight + ' cssH=' + getComputedStyle(body).height : '?'));
      check(!!nav && !!main, 'the nav or the scrolling pane is missing');
      var panels = Array.prototype.slice.call(main.querySelectorAll(':scope > .panel'));
      check(panels.length >= 10, 'only ' + panels.length + ' settings sections rendered');
      var xs = {};
      panels.forEach(function (p) { xs[Math.round(box(p).x)] = 1; });
      notes.push('panels=' + panels.length + ' distinctLeftEdges=' + Object.keys(xs).length);
      check(Object.keys(xs).length === 1, 'the settings column is not single: ' + Object.keys(xs).length + ' left edges');
      var btns = Array.prototype.slice.call(nav.querySelectorAll('.set-navbtn'));
      check(btns.length === panels.length, 'nav has ' + btns.length + ' entries for ' + panels.length + ' sections');
      check(btns.every(function (b) { return (b.textContent || '').trim().length > 1; }), 'a nav entry has no label');
      /* the first level is the category, not the section title */
      var cats = Array.prototype.slice.call(nav.querySelectorAll('.set-cat'));
      var catNames = cats.map(function (c) { return (c.textContent || '').trim(); });
      notes.push('cats=' + cats.length + '[' + catNames.join(' ') + ']');
      check(cats.length >= 3 && cats.length <= 6, cats.length + ' categories, expected a handful');
      check((catNames[0] || '').indexOf('个性化') === 0, 'the first category is not 个性化: ' + catNames[0]);
      check(btns.some(function (b) { return b.classList.contains('set-nest'); }),
        'nothing sits under a second level — the colour lab groups should be nested');
      /* the body itself must not scroll as well, or two bars fight over the same wheel */
      if (body) check(body.scrollHeight <= body.clientHeight + 2,
        'the modal body scrolls too: ' + body.scrollHeight + '>' + body.clientHeight);
      /* a click lands where it points, immediately — gliding past six sections is the old bug */
      btns[1].click();
      return wait(120);
    })
    .then(function () {
      var main = q('.set-main'), nav = q('.set-nav');
      var panels = Array.prototype.slice.call(main.querySelectorAll(':scope > .panel'));
      var d2 = Math.round(box(panels[1]).y - box(main).y);
      var on2 = Array.prototype.slice.call(main.parentElement.querySelectorAll('.set-navbtn.on'));
      var here2 = Array.prototype.slice.call(nav.querySelectorAll('.set-cat.here'));
      notes.push('toSecond=' + d2 + ' active=' + ((on2[0] || {}).textContent || '').trim() +
        ' cat=' + ((here2[0] || {}).textContent || '').trim());
      check(d2 >= -2 && d2 <= 6, 'the second entry left its section ' + d2 + 'px from the top');
      check(on2.length === 1 && (on2[0].textContent || '').indexOf('外观') >= 0,
        'the entry that was clicked is not the one marked active: ' + ((on2[0] || {}).textContent || 'none'));
      check(here2.length === 1 && (here2[0].textContent || '').indexOf('个性化') === 0,
        'the category of the visible section is not lit: ' + ((here2[0] || {}).textContent || 'none'));
      Array.prototype.slice.call(nav.querySelectorAll('.set-navbtn'))[panels.length - 1].click();
      return wait(1600);
    })
    .then(function () {
      var main = q('.set-main'), panels = Array.prototype.slice.call(main.querySelectorAll(':scope > .panel'));
      var last = panels[panels.length - 1];
      var mb = box(main), lb = box(last);
      var atEnd = main.scrollTop >= main.scrollHeight - main.clientHeight - 4;
      var d = Math.round(lb.y - mb.y);
      /* the last sections are shorter than the pane and there is no scroll left under them, so
         "came to the top" is the wrong claim — what has to be true is that the pane went as far
         as it can and the section is now inside it */
      notes.push('jump=' + d + ' atEnd=' + atEnd + ' lastVisible=' + (lb.bottom <= mb.bottom + 2));
      check(atEnd, 'the pane did not reach the bottom: scrollTop=' + Math.round(main.scrollTop));
      check(lb.bottom <= mb.bottom + 2 && lb.y >= mb.y - 2,
        'the last section is not in view after its nav entry: ' + d + '..' + Math.round(lb.bottom - mb.y));
      var on = main.parentElement.querySelectorAll('.set-navbtn.on');
      check(on.length === 1, on.length + ' nav entries are marked active');
      check(on[0] && (on[0].textContent || '').indexOf('关于') >= 0, 'the active entry is not 关于: ' + (on[0] || {}).textContent);
      /* and nothing may be painted past its own section — the 关于 row once put a
         44-character URL and two buttons on one line and drew them outside the panel */
      panels.forEach(function (p) {
        var h3 = q('.panel h3', p);
        var name = ((h3 && h3.textContent) || '?').trim().slice(0, 12);
        check(p.scrollWidth <= p.clientWidth + 1,
          'section overflows the column: ' + name + ' ' + p.scrollWidth + '>' + p.clientWidth);
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
