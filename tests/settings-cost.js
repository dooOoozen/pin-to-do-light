/* Opening settings costs ~140ms, and the second open of the same modal costs ~13ms, so the
   cost is paid once per process — which also means every A/B done in one launch measures warm
   against warm and proves nothing. This probe therefore measures ONE cold open per launch and
   takes its variant from a global the runner prepends:

     base      — nothing touched, this is the number to beat
     notoks    — the colour lab's 29 token rows (and 29 native colour inputs) never built
     nostyles  — the material rows never built
     noboth    — neither

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel /tmp/settings-cost-base.js
*/
(function () {
  var API = window.API;
  var V = window.__variant || 'base';
  function note(s) { try { API.bootNote('[C] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function nextPaint() {
    return new Promise(function (r) {
      requestAnimationFrame(function () { requestAnimationFrame(r); });
    });
  }

  Promise.resolve().then(function () { return wait(2600); }).then(function () {
    var N = window.NeonTheme;
    if (!N) { note('VARIANT ' + V + ' NO NeonTheme'); return null; }
    if (V === 'notoks' || V === 'noboth') N.TOKENS = [];
    if (V === 'nostyles' || V === 'noboth') N.STYLES = [];
    var t0 = performance.now();
    document.getElementById('btnSettings').click();
    return nextPaint().then(function (t1) {
      var root = document.getElementById('palRows');
      var rows = root ? root.childElementCount : -1;
      var styleRows = document.getElementById('styleRows');
      note('VARIANT ' + V + ' cold-open=' + (t1 - t0).toFixed(1) + 'ms' +
        ' palRows=' + rows + ' styleRows=' + (styleRows ? styleRows.childElementCount : -1));
      return null;
    });
  }).catch(function (e) { note('ERROR ' + (e && e.message)); });
})();
