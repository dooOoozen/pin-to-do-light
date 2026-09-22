/* Three panel-side faults, all of them about the receipt machine sitting on top of other
   things: it covered the settings modal and swallowed its clicks (z-index), tearing a
   sheet off in the panel left the full-window backdrop up with nothing in it (the desk
   stayed dead), and the falling paper dragged a scrollbar down the right edge.
   Each is checked with elementFromPoint and computed styles, not with a screenshot. */
(function () {
  function note(s) { try { window.API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function q(s) { return document.querySelector(s); }

  function who(tag, x, y) {
    var el = document.elementFromPoint(x, y);
    var chain = [];
    for (var e = el; e && chain.length < 3; e = e.parentElement) {
      chain.push(e.tagName + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''));
    }
    note(tag + ' @' + Math.round(x) + ',' + Math.round(y) + ' -> ' + (chain.join(' < ') || 'null'));
    return String(chain[0] || '') + ' ' + chain.join(' ');
  }

  setTimeout(function () {
    var styleBefore = null;
    window.API.getState().then(function (st) {
      styleBefore = st.settings.dockMovable;
      window.Receipt.open(st);
      return wait(3600);
    }).then(function () {
      note('machine up=' + window.Receipt.active() + ' backdrop=' + (q('.rcp-backdrop') ? getComputedStyle(q('.rcp-backdrop')).zIndex : '-'));
      var btn = q('#btnSettings');
      if (!btn) { note('NO SETTINGS BUTTON'); return; }
      btn.click();
      return wait(900);
    }).then(function () {
      var panel = q('.modal-panel');
      if (!panel) { note('NO MODAL'); return; }
      var b = panel.getBoundingClientRect();
      note('modal z=' + getComputedStyle(q('.modal-backdrop')).zIndex + ' box=' +
        Math.round(b.left) + ',' + Math.round(b.top) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
      /* the point of this: with the receipt machine open on the same window, the settings
         modal's own control must be what the browser hit-tests there. The machine has a
         .rcp-at input too, so naming the element is not enough — it has to be inside the
         panel. Clicking a JS reference would pass even with a layer over it. */
      var sw = panel.querySelector('#panelInterface .switch') || panel.querySelector('.switch');
      var t = sw.getBoundingClientRect();
      var hit = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2);
      note('switchRect=' + Math.round(t.left) + ',' + Math.round(t.top) + ' ' +
        Math.round(t.width) + 'x' + Math.round(t.height) +
        ' hitIsSwitch=' + (hit === sw) +
        ' hitInModal=' + !!(hit && hit.closest && hit.closest('.modal-panel')) +
        ' hit=' + (hit ? hit.tagName + '.' + hit.className : 'null'));
      who('overSwitch', t.left + t.width / 2, t.top + t.height / 2);
      who('overHead', b.left + b.width / 2, b.top + 12);
      if (hit === sw) hit.click();
      return wait(500);
    }).then(function () { return window.API.getState(); })
      .then(function (st) {
        note('switchWorked=' + (st.settings.dockMovable !== styleBefore) + ' now=' + st.settings.dockMovable);
        /* put it back and close the modal the way a user would */
        var done = document.querySelector('.modal-panel [data-act="done"]');
        if (done) done.click();
        return wait(400);
      })
      .then(function () {
        return window.API.op({ type: 'settings:update', patch: { dockMovable: styleBefore } });
      })
      .then(function () { return wait(400); })
      .then(function () {
        /* tear it off in the panel: a new sheet should come out, and no scrollbar */
        var back = q('.rcp-backdrop');
        var paper = q('.rcp-paper');
        var bb = paper.getBoundingClientRect();
        note('beforeTear bar=' + (back.scrollHeight - back.clientHeight) + ' active=' + window.Receipt.active());
        paper.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 4, clientX: bb.left + 70, clientY: bb.top + 10 }));
        paper.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 4, clientX: bb.left + 70, clientY: bb.top + 110 }));
        paper.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 4 }));
        return wait(700);
      })
      .then(function () {
        var back = q('.rcp-backdrop');
        var p2 = q('.rcp-paper');
        note('afterTear active=' + window.Receipt.active() +
          ' overflowY=' + (back ? getComputedStyle(back).overflowY : '-') +
          ' bar=' + (back ? (back.scrollHeight - back.clientHeight) : '-') +
          ' client/offset=' + (back ? back.clientWidth + '/' + back.offsetWidth : '-') +
          ' paperTop=' + (p2 ? Math.round(p2.getBoundingClientRect().top) : '-') +
          ' paperOpacity=' + (p2 ? getComputedStyle(p2).opacity : '-'));
        return wait(3000);
      })
      .then(function () {
        var p3 = q('.rcp-paper');
        note('refed paperTop=' + (p3 ? Math.round(p3.getBoundingClientRect().top) : '-') +
          ' transform=' + (p3 ? p3.style.transform : '-') + ' active=' + window.Receipt.active());
        /* leave no machine on the desk */
        var ex = q('[data-rcp="close"]');
        if (ex) ex.click();
        return wait(300);
      })
      .then(function () { note('closed active=' + window.Receipt.active()); })
      .catch(function (e) { note('ERR ' + (e && e.message ? e.message : e)); });
  }, 1400);
})();
