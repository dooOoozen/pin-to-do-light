/* Batch K put real hardware on the receipt machine: a control plate that must exist in
   the manual mode and be absent in the timed one, a machine that must not walk away from
   the slot while the paper feeds, a body that can be dragged, and an export that carries
   the machine head. All of that is measurable without looking at it — except the paper
   itself, which moves, so that one is for the user to watch. Logs geometry only; restores
   the schedule it toggles. */
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

  function insideRegion(tag, el) {
    var spans = nd && nd.pushed ? nd.pushed() : null;
    if (!el || !spans) { note(tag + ' noSpans'); return; }
    var b = el.getBoundingClientRect();
    var pts = [[b.left, b.top], [b.right - 1, b.top], [b.left, b.bottom - 1], [b.right - 1, b.bottom - 1]];
    var miss = [];
    pts.forEach(function (p, i) {
      var hit = spans.some(function (r) {
        return p[0] >= r.x && p[0] < r.x + r.width && p[1] >= r.y && p[1] < r.y + r.height;
      });
      if (!hit) miss.push(i + '@' + Math.round(p[0]) + ',' + Math.round(p[1]));
    });
    note(tag + ' corners ' + (miss.length ? 'MISSING ' + miss.join(' ') : 'shown') + ' spans=' + spans.length);
  }

  function geom(tag) {
    note(tag + ' machine=' + box(q('.rcp-machine')) + ' plate=' + box(q('.rcp-plate')) +
      ' slot=' + box(q('.rcp-slot')) + ' paperTop=' + (q('.rcp-paper') ? Math.round(q('.rcp-paper').getBoundingClientRect().top) : '-') +
      ' paperPx=' + (q('.rcp-paper') ? q('.rcp-paper').width + 'x' + q('.rcp-paper').height : '-'));
  }

  setTimeout(function () {
    var schedBefore = null;
    var origin = null;
    API.getState().then(function (st) {
      schedBefore = JSON.parse(JSON.stringify(st.settings.receipt));
      note('state receipt=' + JSON.stringify(schedBefore) + ' sound=' + st.settings.sound);
      window.Receipt.open(st);
      note('plate ctl=' + n('.rc-ctl') + ' knobs=' + n('.rc-knob') + ' push=' + n('.rc-push') +
        ' keys=' + n('.rc-key') + ' lever=' + n('.rc-lever') + ' leds=' + n('.rc-led') +
        ' time=' + n('.rcp-at') + ' knobFace=' + n('.rc-knob-face') +
        ' plateLeftOfRig=' + (function () {
          var p = q('.rcp-plate'), r = q('.rcp-rig');
          return p && r ? (p.getBoundingClientRect().right <= r.getBoundingClientRect().left + 2) : '-';
        })());
      geom('feed t0');
      insideRegion('t0', q('.rcp-machine'));
      return wait(1400);
    }).then(function () {
      geom('feed t1400');
      return wait(1600);
    }).then(function () {
      geom('feed t3000');
      insideRegion('settled', q('.rcp-machine'));
      /* the timer knob must write the whole triple, not just the switch */
      var knob = q('[data-rcp="timer"]');
      knob.click();
      return wait(500);
    }).then(function () { return API.getState(); })
      .then(function (st) {
        note('afterKnob receipt=' + JSON.stringify(st.settings.receipt) +
          ' knobClass=' + q('[data-rcp="timer"]').className +
          ' led=' + q('[data-led="timer"]').className);
        /* the export is the one item here that can be checked arithmetically: the head
           adds a known 52+3 above and 26 each side, at SCALE 2 */
        var p = q('.rcp-paper');
        note('paperPx=' + p.width + 'x' + p.height + ' expectPng=' +
          (p.width + 104) + 'x' + (p.height + 122));
        q('[data-rcp="save"]').click();
        return wait(1200);
      })
      .then(function () {
        return wait(200).then(function () {
          note('manualStillUp active=' + window.Receipt.active());
          return API.getState();
        });
      })
      .then(function (st) {
        window.Receipt.auto(st, { x: 420, y: 260 });
        origin = { l: q('.rcp').offsetLeft, t: q('.rcp').offsetTop };
        note('auto plate=' + n('.rcp-plate') + ' backClass=' + (q('.rcp-backdrop') || {}).className +
          ' machine=' + box(q('.rcp-machine')) + ' active=' + window.Receipt.active());
        insideRegion('auto', q('.rcp-machine'));
        var rig = q('.rcp');
        var m = q('.rcp-machine');
        var r = m.getBoundingClientRect();
        var pd = new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, clientX: r.left + 30, clientY: r.top + 12 });
        m.dispatchEvent(pd);
        m.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: r.left + 150, clientY: r.top + 80 }));
        var movedTo = { l: rig.offsetLeft, t: rig.offsetTop };
        m.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 }));
        note('drag from=' + origin.l + ',' + origin.t + ' to=' + movedTo.l + ',' + movedTo.t +
          ' chaseHook=' + (typeof window.__rcpChase) + ' style=' + rig.style.left + '/' + rig.style.top);
        insideRegion('afterDrag', q('.rcp-machine'));
        return wait(4200);
      })
      .then(function () {
        note('pinned active=' + window.Receipt.active() + ' paperTop=' +
          (q('.rcp-paper') ? Math.round(q('.rcp-paper').getBoundingClientRect().top) : '-'));
        /* one touch anywhere tears it off */
        q('.rcp-machine').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, clientX: 40, clientY: 10 }));
        q('.rcp-machine').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9, clientX: 40, clientY: 10 }));
        q('.rcp').click();
        return wait(1400);
      })
      .then(function () {
        note('afterTear active=' + window.Receipt.active());
        return API.op({ type: 'settings:update', patch: { receipt: schedBefore } });
      })
      .then(function () { return wait(400); })
      .then(function () { return API.getState(); })
      .then(function (st) { note('restored receipt=' + JSON.stringify(st.settings.receipt)); })
      .catch(function (e) { note('ERR ' + (e && e.message ? e.message : e)); });
  }, 1500);
})();
