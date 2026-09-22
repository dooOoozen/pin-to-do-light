/* The receipt machine, checked without looking at it.
   The bug this fixture exists to catch is the one a synthetic event used to hide: the
   machine was drawn inside the window region but absent from hitRects, and had no
   .interactive ancestor, so hitTest() answered "empty desktop" and set WS_EX_TRANSPARENT —
   a receipt you could see but not touch. nd.probe() runs the same two gates the real
   pointer runs, so this time the answer means something. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[R] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function q(s) { return document.querySelector(s); }
  function n(s) { return document.querySelectorAll(s).length; }
  function box(el) {
    if (!el) return '-';
    var b = el.getBoundingClientRect();
    return Math.round(b.left) + ',' + Math.round(b.top) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height);
  }
  function probeAt(tag, el, dx, dy) {
    var b = el.getBoundingClientRect();
    var p = nd.probe(b.left + (dx === undefined ? b.width / 2 : dx), b.top + (dy === undefined ? b.height / 2 : dy));
    note(tag + ' probe=' + p.x + ',' + p.y + ' node=' + p.node +
      ' interactive=' + p.interactive + ' inRect=' + p.inRect + ' rects=' + p.rects.length);
  }

  setTimeout(function () {
    var schedBefore = null;
    API.getState().then(function (st) {
      schedBefore = JSON.parse(JSON.stringify(st.settings.receipt));
      note('state receipt=' + JSON.stringify(schedBefore));
      window.Receipt.open(st);
      return wait(60);
    }).then(function () {
      note('plate btns=' + n('.rc-btn') + ' roller=' + n('.rc-roller') + ' drums=' + n('.rc-drum b') +
        ' leds=' + n('.rc-led') + ' prev=' + n('.rcp-prev') +
        ' order=' + Array.prototype.map.call(document.querySelectorAll('.rcp-plate [data-rcp]'),
          function (b) { return b.getAttribute('data-rcp'); }).join(',') +
        ' firstIsRoller2=' + (q('.rcp-plate .rc-ctl:nth-child(2) [data-roller]') ? 'yes' : 'no') +
        ' plateLeftOfRig=' + (function () {
          var p = q('.rcp-plate'), r = q('.rcp-rig');
          return p && r ? (p.getBoundingClientRect().right <= r.getBoundingClientRect().left + 2) : '-';
        })() + ' plate=' + box(q('.rcp-plate')) + ' rig=' + box(q('.rcp-rig')));
      window.__rigBefore = q('.rcp').getBoundingClientRect().left;
      /* the two gates that used to fail, at the machine head and at the plate */
      probeAt('machine', q('.rcp-machine'));
      probeAt('plate', q('.rcp-plate'));
      return wait(3200);
    }).then(function () {
      probeAt('settled', q('.rcp-machine'));
      note('slot=' + box(q('.rcp-slot')) + ' paper=' + box(q('.rcp-paper')) +
        ' paperPx=' + q('.rcp-paper').width + 'x' + q('.rcp-paper').height);
      /* the drum: a wheel over the left half is hours, over the right half is minutes */
      var roller = q('.rc-roller');
      var rb = roller.getBoundingClientRect();
      var before = q('.rcp-at').value;
      roller.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, deltaY: -100, clientX: rb.left + rb.width * 0.25, clientY: rb.top + 10
      }));
      return wait(300).then(function () {
        note('wheelH ' + before + ' -> ' + q('.rcp-at').value + ' drum=' +
          Array.prototype.map.call(document.querySelectorAll('.rc-drum b'), function (b) { return b.textContent; }).join(':'));
        roller.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, deltaY: 100, clientX: rb.left + rb.width * 0.8, clientY: rb.top + 10
        }));
        return wait(320);
      });
    }).then(function () { return API.getState(); })
      .then(function (st) {
        note('afterWheels receipt=' + JSON.stringify(st.settings.receipt));
        /* 保存 now opens the share preview instead of writing straight out */
        q('[data-rcp="save"]').click();
        return wait(400);
      })
      .then(function () {
        var prev = q('.rcp-prev');
        var shot = prev ? prev.querySelector('canvas') : null;
        note('prev=' + !!prev + ' chips=' + n('.rc-bg') + ' on=' +
          (function () { var c = q('.rc-bg.on'); return c ? c.getAttribute('data-bg') : '-'; })() +
          ' shot=' + (shot ? shot.width + 'x' + shot.height + ' css=' + shot.style.width + '/' + shot.style.height : '-') +
          ' prevBox=' + box(prev) +
          ' opacity=' + (prev ? getComputedStyle(prev).opacity : '-') +
          ' transform=' + (prev ? getComputedStyle(prev).transform : '-') +
          ' inClass=' + (prev ? prev.className : '-') +
          /* the complaint being fixed: opening the preview must not move the machine */
          ' rigMoved=' + (q('.rcp').getBoundingClientRect().left - window.__rigBefore).toFixed(1));
        probeAt('prev', prev);
        var rose = q('.rc-bg[data-bg="rose"]');
        if (rose) rose.click();
        return wait(200).then(function () {
          var c2 = q('.rcp-prev canvas');
          note('afterRose on=' + (function () { var c = q('.rc-bg.on'); return c ? c.getAttribute('data-bg') : '-'; })() +
            ' shot=' + c2.width + 'x' + c2.height +
            ' rigMoved=' + (q('.rcp').getBoundingClientRect().left - window.__rigBefore).toFixed(1));
          var sv = q('[data-prev="save"]');
          if (sv) sv.click();
          return wait(400);
        });
      })
      .then(function () {
        note('afterSave prev=' + n('.rcp-prev') + ' active=' + window.Receipt.active() +
          ' rigMoved=' + (q('.rcp').getBoundingClientRect().left - window.__rigBefore).toFixed(1));
        return API.getState();
      })
      .then(function (st) {
        note('bgSaved=' + JSON.stringify(st.settings.receipt));
        /* now the timed mode: no plate, still touchable, and the desk beside it is not */
        window.Receipt.auto(st, { x: 420, y: 260 });
        return wait(400);
      })
      .then(function () {
        note('auto plate=' + n('.rcp-plate') + ' back=' + (q('.rcp-backdrop') || {}).className);
        probeAt('autoMachine', q('.rcp-machine'));
        probeAt('autoPaper', q('.rcp-paper'));
        var far = nd.probe(60, 60);
        note('far node=' + far.node + ' interactive=' + far.interactive + ' inRect=' + far.inRect);
        return wait(3000);
      })
      .then(function () {
        /* pull the sheet: it should follow, then come off */
        var paper = q('.rcp-paper');
        var b = paper.getBoundingClientRect();
        paper.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, clientX: b.left + 60, clientY: b.top + 8 }));
        paper.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 3, clientX: b.left + 60, clientY: b.top + 90 }));
        note('pull transform=' + paper.style.transform);
        paper.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3 }));
        return wait(900);
      })
      .then(function () {
        note('afterPull active=' + window.Receipt.active());
        return API.op({ type: 'settings:update', patch: { receipt: schedBefore } });
      })
      .then(function () { return wait(400); })
      .then(function () { return API.getState(); })
      .then(function (st) { note('restored receipt=' + JSON.stringify(st.settings.receipt)); })
      .catch(function (e) { note('ERR ' + (e && e.message ? e.message : e)); });
  }, 1500);
})();
