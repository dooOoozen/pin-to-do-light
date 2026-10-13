/* 卡盒随着主题更改没有做出相应的颜色变化 — which parts of the deck actually follow the material?

   The deck is built from the same tokens as the panel, so a piece that keeps its colour across
   materials is a rule naming something other than a token. Reading the computed value of each
   part under every material, in both hours, is the only way to tell those apart: a value that
   repeats across all ten is not themed. The face paints a texture over its colour, so the
   background-image is reported too — a colour that changes behind an opaque gradient is still
   a deck that does not change.

   Run on the second display:
     pin-tauri.exe --monitor 2 --test-script tests/deck-style.js */
(function () {
  var API = window.API, doc = document;
  function note(s) { try { API.bootNote('[D] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var STYLES = ['blueprint', 'print', 'diner', 'ikb', 'garden', 'console', 'frost', 'memphis', 'hazard', 'chrome'];
  var PARTS = [['face', '#deckFace', 'backgroundColor'], ['head', '.deck-head', 'backgroundColor'],
    ['tag', '.deck-tag', 'color'], ['name', '.deck-name', 'color'],
    ['count', '.deck-count', 'color'], ['tool', '.dock-tools .tool', 'backgroundColor'],
    ['chip', '.gchip', 'backgroundColor'], ['active', '.gchip.active', 'backgroundColor']];
  var fails = [], before = null;

  function snap() {
    var out = [];
    PARTS.forEach(function (p) {
      var n = doc.querySelector(p[1]);
      if (!n) { out.push(p[0] + '=missing'); return; }
      var v = getComputedStyle(n)[p[2]];
      var m = /([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(String(v));
      out.push(p[0] + '=' + (m ? m[1] + ',' + m[2] + ',' + m[3] : v));
    });
    var face = doc.querySelector('#deckFace');
    var img = face ? String(getComputedStyle(face).backgroundImage) : '';
    var dock = doc.getElementById('dock');
    out.push('tex=' + (img === 'none' ? 'none' : img.replace(/\s+/g, '').slice(0, 30)));
    out.push('accent=' + (dock ? dock.style.getPropertyValue('--accent') : '?'));
    return out.join(' ');
  }

  function pass(theme) {
    var seen = {};
    return API.op({ type: 'settings:update', patch: { theme: theme } }).then(function () { return wait(420); })
      .then(function () {
        var chain = Promise.resolve();
        STYLES.forEach(function (s) {
          chain = chain.then(function () {
            return API.op({ type: 'settings:update', patch: { style: s } }).then(function () { return wait(420); });
          }).then(function () {
            var on = doc.documentElement.dataset.style;
            var line = theme[0] + ' ' + s + (on === s ? '' : ' ROOT-IS-' + on) + ' | ' + snap();
            note(line);
            var m = /face=([\d.,]+)/.exec(line);
            if (m) (seen[m[1]] = seen[m[1]] || []).push(s);
            if (on !== s) fails.push(theme + '/' + s + ' root-style=' + on);
          });
        });
        return chain;
      })
      .then(function () {
        note(theme.toUpperCase() + ' distinct faces = ' + Object.keys(seen).length + ' of ' + STYLES.length +
          ' | ' + Object.keys(seen).map(function (k) { return k + ':' + seen[k].length; }).join(' '));
        if (Object.keys(seen).length < Math.min(6, STYLES.length)) fails.push(theme + '-FACE-NOT-THEMED ' + Object.keys(seen).length);
      });
  }

  Promise.resolve().then(function () { return wait(1500); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      before = { style: st.settings.style, theme: st.settings.theme };
      note('start ' + before.theme + '/' + before.style);
      return pass('paper');
    })
    .then(function () { return pass('ink'); })
    .then(function () { return API.op({ type: 'settings:update', patch: before }); })
    .then(function () { note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS') + ' restored'); })
    .catch(function (e) {
      if (before) API.op({ type: 'settings:update', patch: before });
      note('RESULT ERROR ' + (e && e.message));
    });
})();
