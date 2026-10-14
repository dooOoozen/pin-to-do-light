/* 左导航到底比别的主题高在哪儿，以及快速新建的示例字到底差几个像素。

   .side-scroll is `overflow-y: auto`, so a scrollbar appears the moment its content is one pixel
   taller than the box. 群青构成 and 铬黄丝网 show a bar every other material hides, which means
   something inside them measures taller. This walks all ten materials, reads the overflow and the
   bar width, and names the child rows so the culprit is not guessed at. The same pass measures
   the quick-add placeholder against the text area its input leaves over, because an input clips a
   placeholder rather than ellipsising it.

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/side-scroll.js */
(function () {
  var API = window.API, doc = document;
  function note(s) { try { API.bootNote('[S] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var STYLES = ['blueprint', 'print', 'diner', 'ikb', 'garden', 'frost', 'console', 'memphis', 'hazard', 'chrome'];
  var fails = [], before = null;

  function probe(style) {
    var sc = doc.querySelector('.side-scroll');
    if (!sc) { fails.push('NO-SIDE-SCROLL'); return; }
    var over = sc.scrollHeight - sc.clientHeight;
    var bar = sc.offsetWidth - sc.clientWidth;
    var kids = Array.prototype.slice.call(sc.children).map(function (n) {
      var r = n.getBoundingClientRect();
      return (n.className || n.tagName).split(' ')[0] + ':' + Math.round(r.height);
    });
    var cs = getComputedStyle(sc);
    note(style + ' over=' + over + ' bar=' + bar + ' gap=' + cs.gap + ' pad=' + cs.paddingTop + '/' + cs.paddingBottom +
      ' | ' + kids.join(' '));
    if (bar > 0 && over <= 0) fails.push(style + ' BAR-WITHOUT-OVERFLOW');
    if (bar > 0) fails.push(style + ' HAS-SCROLLBAR over=' + over);
    /* the quick-add placeholder: an <input> clips a placeholder that does not fit, it never
       ellipsises, so the last glyph disappears. Measured against the text area the input actually
       leaves over, with the same font the placeholder is drawn in. */
    var qa = doc.getElementById('qaInput');
    if (qa) {
      var qc = getComputedStyle(qa);
      var ctx = doc.createElement('canvas').getContext('2d');
      ctx.font = qc.font;
      var ph = qa.placeholder || '';
      var tw = ctx.measureText(ph).width;
      var room = qa.clientWidth - parseFloat(qc.paddingLeft) - parseFloat(qc.paddingRight);
      note('   qa font=' + qc.fontSize + ' text=' + Math.round(tw) + ' room=' + Math.round(room) +
        ' room-text=' + Math.round(room - tw));
      if (tw > room) fails.push(style + ' PLACEHOLDER-CLIPPED by=' + Math.round(tw - room) + 'px');
    }
  }

  Promise.resolve().then(function () { return API.getState(); })
    .then(function (st) {
      before = st.settings.style;
      note('start style=' + before + ' theme=' + st.settings.theme);
      var chain = Promise.resolve();
      STYLES.forEach(function (s) {
        chain = chain.then(function () {
          return API.op({ type: 'settings:update', patch: { style: s } }).then(function () { return wait(420); });
        }).then(function () { probe(s); });
      });
      return chain;
    })
    .then(function () { return API.op({ type: 'settings:update', patch: { style: before } }); })
    .then(function () { note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS') + ' (style restored)'); })
    .catch(function (e) {
      if (before) API.op({ type: 'settings:update', patch: { style: before } });
      note('RESULT ERROR ' + (e && e.message));
    });
})();
