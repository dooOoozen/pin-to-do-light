/* 调色台现在到底能调到哪儿。

   报告说「很多部分调节不到（比如面板的各种线条），应该标注分别对应哪里的颜色」。改完之后这里
   逐项核对：每一行有没有写它画在哪里；「线条」那一组是不是每条线都有取色器 + 浓度滑条；滑条的
   起始值是不是这条线真正生效的浓度；拖动滑条之后界面上的线有没有真的变；以及整趟下来
   settings.palette 有没有被写脏 —— 用户自己钉过的颜色不能被测试改掉。

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/pal-lab.js */
(function () {
  var API = window.API, doc = document;
  function note(s) { try { API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var fails = [], beforePal = null;

  var probe = null;
  function alpha(css) {
    if (!probe) {
      probe = doc.createElement('span');
      probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;visibility:hidden';
      doc.documentElement.appendChild(probe);
    }
    probe.style.color = '';
    probe.style.color = css;
    var s = getComputedStyle(probe).color;
    var m = /color\(\s*srgb[^)]*?\/\s*([\d.]+)/.exec(s) || /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(s);
    if (m) return parseFloat(m[1]);
    return /rgb\(/.test(s) ? 1 : NaN;
  }

  function rowsOf(groupText) {
    var heads = Array.prototype.slice.call(doc.querySelectorAll('.pal-group'));
    var h = heads.filter(function (n) { return (n.textContent || '').indexOf(groupText) >= 0; })[0];
    if (!h) return null;
    var out = [];
    for (var n = h.nextElementSibling; n && !n.classList.contains('pal-group'); n = n.nextElementSibling) {
      if (n.classList.contains('pal-row')) out.push(n);
    }
    return out;
  }

  Promise.resolve().then(function () { return API.getState(); })
    .then(function (st) {
      beforePal = JSON.stringify(st.settings.palette || {});
      var b = doc.getElementById('btnSettings');
      if (!b) throw new Error('no settings button');
      b.click();
      return wait(800);
    })
    .then(function () {
      var all = Array.prototype.slice.call(doc.querySelectorAll('.pal-row'));
      var noWhere = all.filter(function (r) {
        var w = r.querySelector('.pal-where');
        return !w || !(w.textContent || '').trim();
      });
      note('rows=' + all.length + ' no-where=' + noWhere.length +
        ' groups=' + doc.querySelectorAll('.pal-group').length);
      if (all.length < 38) fails.push('ROWS-MISSING ' + all.length);
      if (noWhere.length) fails.push('ROW-WITHOUT-WHERE ' + noWhere.length);

      var lines = rowsOf('线条');
      if (!lines) { fails.push('NO-LINES-GROUP'); return; }
      note('lines=' + lines.length);
      if (lines.length !== 10) fails.push('LINES-COUNT ' + lines.length);
      var noSlider = lines.filter(function (r) { return !r.querySelector('input[type=range]'); });
      if (noSlider.length) fails.push('LINE-NO-STRENGTH ' + noSlider.length);

      /* the slider has to start on the strength the line actually renders at, not on a number
         the sheet happens to spell — most materials never write --rule-a and ride the fallback */
      var edge = lines[0];
      var rng = edge.querySelector('input[type=range]');
      var live = Math.round(alpha('var(--edge)') * 100);
      note('edge slider=' + (rng ? rng.value : 'n/a') + ' live-alpha=' + live);
      if (!rng || Math.abs(Number(rng.value) - live) > 2) fails.push('SLIDER-START ' + (rng ? rng.value : 'n/a') + '<>' + live);

      /* drag it and the panel must answer. The handler writes one inline custom property, so the
         undo is that same property put back exactly — including the case where the user's own
         pin had put a value there first, which a blanket removeProperty would have wiped. */
      if (rng) {
        var root = doc.documentElement;
        var prev = root.style.getPropertyValue('--edge-a');
        rng.value = String(Math.min(100, live + 30));
        rng.dispatchEvent(new Event('input', { bubbles: true }));
        var after = Math.round(alpha('var(--edge)') * 100);
        note('after-drag alpha=' + after);
        if (after <= live + 5) fails.push('SLIDER-DOES-NOTHING ' + live + '->' + after);
        if (prev) root.style.setProperty('--edge-a', prev); else root.style.removeProperty('--edge-a');
        var back = Math.round(alpha('var(--edge)') * 100);
        note('restored alpha=' + back);
        if (Math.abs(back - live) > 2) fails.push('NOT-RESTORED ' + live + '->' + back);
      }
    })
    .then(function () { return API.getState(); })
    .then(function (st) {
      var now = JSON.stringify(st.settings.palette || {});
      note('palette-untouched=' + (now === beforePal));
      if (now !== beforePal) fails.push('STORE-WRITTEN');
      var cb = doc.querySelector('.modal-root [data-act="done"]');
      if (cb) cb.click();
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS'));
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
