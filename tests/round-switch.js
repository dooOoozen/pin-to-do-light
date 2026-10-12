/* 圆角风格 is now a switch rather than a material, so the assertion is about every surface at
   once: with it OFF, nothing that takes its radius from a token may still be round, and with it
   ON every one of them must be. That is the only way to catch the half-adapted spot — the nav's
   quick-add button shipped square inside the rounded style because it simply never declared a
   radius, and a test that only looked at .btn would never have noticed.

   The elements are sampled from the live DOM, not from a list of class names, so a control that
   does not exist on this view is skipped rather than failed. The user's own setting is restored.

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/round-switch.js */
(function () {
  var API = window.API;
  var fails = [], notes = [];
  function note(s) { try { API.bootNote('[O] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function check(ok, label) { if (!ok) fails.push(label); }

  /* the token-driven surfaces, across every view the panel can show. '.panel' is deliberately
     not here: a bare .panel has no radius of its own in any material — it is .hud-thin that
     carries it — so asserting on it would fail for a reason that has nothing to do with the
     switch. */
  var PROBE = ['.btn', '.icon-btn', '.input', '.select', '.qa-btn', '.tool', '.day-head',
    '.switch', '.badge', '.gauto', '.idx-mark', '.cal-day', '.task-dot', '.mini-dot',
    '.hud', '.hud-thin', '.modal-panel', '.stat', '.field', '.set-row', '.memo-input'];

  function setRound(on) {
    return API.op({ type: 'settings:update', patch: { roundCorners: !!on } }).then(function () {
      return wait(320);
    });
  }

  /* radius of the first live node of each selector, or null when that class is not on screen */
  function readRadii() {
    var out = {};
    PROBE.forEach(function (sel) {
      var list = document.querySelectorAll(sel);
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e.offsetParent === null) continue;
        var cs = getComputedStyle(e);
        var r = parseFloat(cs.borderTopLeftRadius) || 0;
        out[sel] = (out[sel] || 0) < r ? r : (out[sel] || r);
      }
    });
    return out;
  }

  var was = null;
  Promise.resolve().then(function () { return wait(2400); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      was = st.settings.roundCorners !== false;
      notes.push('was=' + was);
      /* the switch has to be findable, or the flag is only real for whoever wrote the test */
      document.getElementById('btnSettings').click();
      return wait(700);
    })
    .then(function () {
      var found = Array.prototype.slice.call(document.querySelectorAll('.set-label')).some(function (n) {
        return (n.textContent || '').indexOf('圆角风格') >= 0;
      });
      check(found, 'no 圆角风格 row in the settings modal');
      var c = document.querySelector('[data-act="done"]');
      if (c) c.click();
      return wait(500);
    })
    .then(function () {
      return setRound(false);
    })
    .then(function () {
      check(document.documentElement.dataset.round === 'off',
        'data-round is ' + document.documentElement.dataset.round + ' with the switch off');
      var r = readRadii();
      var round = Object.keys(r).filter(function (k) { return r[k] > 0; });
      notes.push('off: ' + Object.keys(r).length + ' surfaces, still-round=' + (round.join(',') || 'none'));
      check(round.length === 0, 'square mode leaves rounded surfaces: ' + round.map(function (k) {
        return k + '=' + r[k];
      }).join(' '));
      return setRound(true);
    })
    .then(function () {
      check(document.documentElement.dataset.round === 'on',
        'data-round is ' + document.documentElement.dataset.round + ' with the switch on');
      var r = readRadii();
      var flat = Object.keys(r).filter(function (k) { return !(r[k] > 0); });
      notes.push('on: ' + Object.keys(r).length + ' surfaces, still-square=' + (flat.join(',') || 'none'));
      check(flat.length === 0, 'round mode leaves square surfaces: ' + flat.join(' '));
      return null;
    })
    .then(function () { return setRound(was); })
    .then(function () {
      return API.getState();
    })
    .then(function (st) {
      var back = st.settings.roundCorners !== false;
      check(back === was, 'the user setting did not come back: ' + back + ' vs ' + was);
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS') + ' ' + notes.join(' | '));
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
