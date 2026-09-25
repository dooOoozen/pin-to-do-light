/* "悬停卡片收回时有一瞬间文字变大" is a claim about frames, so measure frames.
   Perceived text size is the computed font size times whatever scale the card is under, and
   here the two come from different rules: the chip font is set for the compact card, the
   flight-home scale is a transform. Sampling both across a real retract says which one jumps
   and by how much.

   Two things make the artifact worth measuring instead of reading off the cascade: the chip
   fades out over 260ms while it flies, so it is still on screen when the font changes, and
   the size of the jump is the user's own setting — with 散布卡片文字 pushed to its 1.6x top
   the title is 1.48x bigger for those frames, which is not subtle.

   Worst case settings are applied for the run and restored. Cards are seeded and deleted
   because the active group can legitimately be empty, and an empty deck made the first
   version of this probe report "nothing sampled" after it had already opened the spread.
   The old cascade is re-injected as a control at the end: a detector that cannot see the
   artifact when it is deliberately present is not reporting, it is agreeing. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[H] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function q(sel, root) { return (root || document).querySelector(sel); }

  var seedIds = [], known = [], was = {}, gone = [];

  function scaleOf(el) {
    var m = /matrix3d\(([^)]+)\)/.exec(getComputedStyle(el).transform) ||
            /matrix\(([^)]+)\)/.exec(getComputedStyle(el).transform);
    if (!m) return 1;
    var p = m[1].split(',');
    return Math.abs(parseFloat(p[0])) || 1;
  }

  function row(card, tag) {
    var t = q('.card-title', card);
    var cs = getComputedStyle(card), ts = getComputedStyle(t);
    return {
      tag: tag, mode: document.body.dataset.mode,
      px: (parseFloat(ts.fontSize) * scaleOf(card)).toFixed(2),
      font: parseFloat(ts.fontSize).toFixed(2), scale: scaleOf(card).toFixed(3),
      op: (+cs.opacity).toFixed(2), ps: ts.getPropertyValue('--ps').trim() ||
        getComputedStyle(document.body).getPropertyValue('--ps').trim()
    };
  }

  /* one retract: park the pointer over the dock until the spread exists, let the pop-in
     finish, then leave it and read a frame every 25ms while the chips fly home */
  function collapseOnce(away) {
    var r = nd.dockRect();
    return wait(120).then(function () {
      return new Promise(function (res) {
        var iv = setInterval(function () {
          nd.cursorCmd((r.left + r.right) / 2, (r.top + r.bottom) / 2, true);
          var c = Array.prototype.filter.call(document.querySelectorAll('.todo-card'), function (x) {
            return !x.classList.contains('docked') && !x.classList.contains('pinned');
          });
          if (c.length && nd.mode() === 'overview') { clearInterval(iv); res(c); }
        }, 90);
        setTimeout(function () { clearInterval(iv); res([]); }, 3000);
      });
    }).then(function (c) {
      if (!c.length) throw new Error('deck never spread (mode=' + nd.mode() + ')');
      /* the baseline has to be the settled spread: sampled during the pop-in it reads as
         half size and every later frame looks like growth */
      return wait(800).then(function () {
        var settled = c.map(function (x) { return row(x, 'settled'); });
        var rows = [];
        return new Promise(function (res) {
          var n = 0;
          nd.cursorCmd(away.x, away.y, true);
          var iv = setInterval(function () {
            c.forEach(function (x) { rows.push(row(x, 't+' + (n * 25))); });
            if (++n > 16) { clearInterval(iv); res({ settled: settled, rows: rows }); }
          }, 25);
        });
      });
    });
  }

  /* The artifact is a font swap at the moment the mode changes, so that is what is compared:
     a chip that is still on screen has to keep the size it had in the spread. The transform
     may shrink it on the way home — that is the flight, and the user asked for it. */
  function verdict(label, r) {
    var base = parseFloat(r.settled[0].font);
    var visible = r.rows.filter(function (x) { return parseFloat(x.op) > 0.02; });
    var peak = visible.reduce(function (a, b) {
      return (!a || parseFloat(b.font) > parseFloat(a.font)) ? b : a;
    }, null);
    var pBase = parseFloat(r.settled[0].px);
    var pPeak = visible.reduce(function (a, b) {
      return (!a || parseFloat(b.px) > parseFloat(a.px)) ? b : a;
    }, null);
    note(label + ' settled font=' + base + ' perceived=' + pBase + 'px ps=' + r.settled[0].ps +
      ' | frames=' + r.rows.length + ' stillOnScreen=' + visible.length);
    note(label + ' first: ' + r.rows.slice(0, 3).map(function (x) {
      return x.tag + ' font=' + x.font + ' scale=' + x.scale + ' perceived=' + x.px + ' op=' + x.op;
    }).join(' | '));
    if (!peak) { note(label + ' RESULT no frame visible on screen'); return null; }
    var ratio = parseFloat(peak.font) / (base || 1);
    note(label + ' peak font=' + peak.font + ' at ' + peak.tag + ' (scale=' + peak.scale +
      ' op=' + peak.op + ') ratio=' + ratio.toFixed(3) +
      ' | perceived peak=' + pPeak.px + 'px ratio=' + (parseFloat(pPeak.px) / pBase).toFixed(3));
    return ratio;
  }

  var oldCss =
    'body[data-mode="overview"] .todo-card.compact{font-size:calc(13.5px * var(--cs,1) * var(--ps,1))}' +
    'body[data-mode="overview"] .todo-card.compact .card-title{font-size:calc(13.5px * var(--cs,1) * var(--ps,1))}' +
    'body:not([data-mode="overview"]) .todo-card.compact{font-size:calc(12.5px * var(--cs,1) * var(--fontk,1) * var(--ps,1))}' +
    'body:not([data-mode="overview"]) .todo-card.compact .card-title{font-size:calc(12.5px * var(--cs,1) * var(--fontk,1) * var(--ps,1))}';

  API.getState().then(function (st) {
    was = { cardFontScale: st.settings.cardFontScale, chipFontScale: st.settings.chipFontScale,
      activeGroupId: st.settings.activeGroupId };
    known = st.todos.map(function (t) { return t.id; });
    nd.autoTuck(false);
    nd.tuck(false);
    /* the largest gap the two settings allow: chip text at its floor, card text at its top */
    return API.op({ type: 'settings:update', patch: { cardFontScale: 1.6, chipFontScale: 1 } });
  }).then(function () {
    var gid = was.activeGroupId;
    return Promise.all([
      API.op({ type: 'todo:add', title: '自动测试 悬停收回甲', groupId: gid, dueAt: null }),
      API.op({ type: 'todo:add', title: 'auto test retract chip', groupId: gid, dueAt: null })
    ]);
  }).then(function (res) {
    return API.getState();
  }).then(function (st) {
    var ids = st.todos.map(function (t) { return t.id; });
    seedIds = ids.filter(function (id) { return known.indexOf(id) < 0; });
    note('seeded=' + seedIds.length + ' cards=' + document.querySelectorAll('.todo-card').length);
    var d = nd.dockRect();
    return { x: Math.min(window.innerWidth - 8, d.right + 500), y: Math.min(window.innerHeight - 8, d.bottom + 320) };
  }).then(function (away) {
    return collapseOnce(away).then(function (r) {
      var fixed = verdict('fixed', r);
      var style = document.createElement('style');
      style.id = 'h-revert';
      style.textContent = oldCss;
      document.head.appendChild(style);
      return collapseOnce(away).then(function (r2) {
        var before = verdict('control(old cascade)', r2);
        style.remove();
        note('RESULT fixed=' + (fixed === null ? 'n/a' : fixed.toFixed(3)) +
          ' oldcascade=' + (before === null ? 'n/a' : before.toFixed(3)));
        note('RESULT ' + (fixed !== null && fixed <= 1.06 && before !== null && before >= 1.2
          ? 'PASS no frame grows the chip text once it flies home, and the probe still sees the jump when the old cascade is put back'
          : (fixed !== null && fixed <= 1.06 ? 'WEAK fixed looks clean but the control did not reproduce (' + before + ')'
            : 'FAIL the chip text still grows by ' + Math.round((fixed - 1) * 100) + '% on retract')));
      });
    });
  }).then(function () {
    return Promise.all(seedIds.map(function (id) { return API.op({ type: 'todo:delete', id: id }); }));
  }).then(function () {
    gone = seedIds.slice();
    return API.op({ type: 'settings:update', patch: {
      cardFontScale: was.cardFontScale, chipFontScale: was.chipFontScale } });
  }).then(function () {
    note('cleanup deleted=' + gone.length + ' settingsBack=' + was.cardFontScale + '/' + was.chipFontScale);
  }).catch(function (e) {
    note('RESULT ERROR ' + (e && e.message));
    return Promise.all(seedIds.map(function (id) { return API.op({ type: 'todo:delete', id: id }); }))
      .then(function () {
        return API.op({ type: 'settings:update', patch: {
          cardFontScale: was.cardFontScale, chipFontScale: was.chipFontScale } });
      }).then(function () { note('cleanup after error done'); });
  });
})();
