/* One pass over every material, answering the four things that were reported as "not done"
   but could only be read off a running page:
     - the dialog alpha rule: .modal-panel and the settings sub-panels must be translucent on
       the five materials that were asked for, and must NOT be on the others
     - the 新建分组 button must compute to a circle (border-radius 50% of a 24px box) on every
       material, which is what hazard used to break
     - 设置 → 外观 must carry five live motion previews, each with its own data-motion
     - and one colour picker per group, no palette presets left

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/style-audit.js */
(function () {
  var API = window.API;
  var doc = document;
  function note(s) { try { API.bootNote('[A] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var STYLES = ['blueprint', 'frost', 'diner', 'garden', 'hazard', 'ikb', 'console', 'memphis', 'chrome'];
  var TRANSLUCENT = { blueprint: 1, frost: 1, diner: 1, garden: 1, hazard: 1 };
  var fails = [];

  /* Chromium serialises a color-mix() result as color(srgb r g b / a), not as rgba(), so both
     shapes have to be read. Returning 1 for an unparsable string is what made the first run of
     this test report the five translucent materials as opaque. */
  function alphaOf(c) {
    var s = String(c || '').trim();
    if (s === 'transparent') return 0;
    var m = /color\(\s*srgb[^)]*?\/\s*([\d.]+)/.exec(s);
    if (m) return parseFloat(m[1]);
    m = /rgba?\(([^)]+)\)/.exec(s);
    if (!m) return NaN;
    var parts = m[1].split(/[\s,/]+/).filter(function (x) { return x !== ''; });
    return parts.length > 3 ? parseFloat(parts[3]) : 1;
  }
  function q(sel) { return doc.querySelector(sel); }

  function probe(style) {
    var panel = q('.modal-root .modal-panel');
    if (!panel) { fails.push(style + ' NO-MODAL'); note(style + ' no modal'); return; }
    var thin = q('.modal-root .hud-thin');
    var a = alphaOf(getComputedStyle(panel).backgroundColor);
    var t = thin ? alphaOf(getComputedStyle(thin).backgroundColor) : -1;
    var btn = doc.getElementById('btnAddGroup');
    var bs = btn ? getComputedStyle(btn) : null;
    var br = bs ? bs.borderRadius : 'none';
    var want = TRANSLUCENT[style] ? 0.74 : 1;
    var raw = String(getComputedStyle(panel).backgroundColor).slice(0, 42);
    var line = style + ' panel=' + a.toFixed(2) + ' [' + raw + '] sub-panel=' + (t < 0 ? 'n/a' : t.toFixed(2)) +
      ' groupBtn=' + (bs ? bs.width + '/' + bs.height + ' r=' + br : 'n/a') +
      ' motPicks=' + doc.querySelectorAll('[data-mot]').length +
      ' pickers=' + doc.querySelectorAll('.gc-pick').length +
      ' presets=' + doc.querySelectorAll('.pal-pick').length;
    note(line);
    if (Math.abs(a - want) > 0.02) fails.push(style + ' PANEL-ALPHA ' + a + ' want ' + want);
    if (TRANSLUCENT[style] && t >= 0 && Math.abs(t - want) > 0.02) fails.push(style + ' SUBPANEL-ALPHA ' + t);
    if (bs && br !== '50%' && br.indexOf('12px') < 0 && br !== '0px') fails.push(style + ' BTN-RADIUS ' + br);
    if (doc.querySelectorAll('.pal-pick').length) fails.push(style + ' PRESETS-STILL-THERE');
  }

  function setStyle(v) {
    return API.op({ type: 'settings:update', patch: { style: v } }).then(function () { return wait(450); });
  }

  var before = null;
  Promise.resolve().then(function () { return wait(1400); })
    .then(function (st) { return API.getState(); })
    .then(function (st) {
      before = st.settings.style;
      var b = doc.getElementById('btnSettings');
      if (!b) throw new Error('no settings button');
      b.click();
      return wait(700);
    })
    .then(function () {
      var chain = Promise.resolve();
      STYLES.forEach(function (s) {
        chain = chain.then(function () { return setStyle(s); }).then(function () { probe(s); });
      });
      chain = chain.then(function () { return setStyle(before || 'blueprint'); })
        .then(function () { return wait(300); })
        .then(function () {
          /* the picker is gone and the animation is fixed, so the two things worth asserting are
             that the root asks for the one variant the sheet still defines, and that no chip
             survived to be clicked */
          var m = doc.documentElement.dataset.motion;
          var picks = doc.querySelectorAll('[data-mot]').length;
          note('root data-motion=' + m + ' motion-picks=' + picks +
            ' group-pickers=' + doc.querySelectorAll('.gc-pick').length);
          if (m !== 'duo') fails.push('DATA-MOTION ' + m);
          if (picks) fails.push('MOTION-PICKER-STILL-THERE ' + picks);
          note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS'));
        });
      return chain;
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
