/* 每一条线在改画法之前到底是什么颜色。

   调色台要能调面板的各种线条，而线条现在是 `color-mix(in srgb, var(--ink) 16%, transparent)`
   这种一次性算完的写法：取色器写进去的是实色，一改就把透明度抹掉了，分隔线立刻变成一条粗黑杠。
   要同时保留「跟着正文字色走」和「单独可调」，只能把 mix 拆成 源色 + 浓度 两个变量。拆的过程
   涉及十套材质 × 昼夜两半、上百行声明，改对改错不能靠眼睛看，所以这里把每个线条变量真正解析到
   什么颜色、什么 alpha 全部打出来，改之前跑一遍存底，改之后再跑一遍逐行对比。

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/line-tokens.js */
(function () {
  var API = window.API, doc = document;
  function note(s) { try { API.bootNote('[L] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var STYLES = ['blueprint', 'print', 'diner', 'ikb', 'garden', 'frost', 'console', 'memphis', 'hazard', 'chrome'];
  var TOKENS = ['--edge', '--rule', '--rule-strong', '--grid-line', '--grid-line-bold',
    '--hatch-line', '--wm-ink', '--hit-line', '--ink-glow', '--memo-rule'];
  var before = null;

  var probe = null;
  function resolve(css) {
    if (!probe) {
      probe = doc.createElement('span');
      probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;visibility:hidden';
      doc.documentElement.appendChild(probe);
    }
    probe.style.color = '';
    probe.style.color = css;
    return getComputedStyle(probe).color;
  }
  /* Chromium serialises a color-mix() result as color(srgb r g b / a), not rgba() */
  function read(c) {
    var s = String(c || '').trim();
    if (s === 'transparent') return '000000@0';
    var m = /color\(\s*srgb\s+([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*\/\s*([\d.]+))?/.exec(s);
    if (m) {
      var h = function (x) { return ('0' + Math.round(Math.max(0, Math.min(1, parseFloat(x))) * 255).toString(16)).slice(-2); };
      return h(m[1]) + h(m[2]) + h(m[3]) + '@' + (m[4] === undefined ? '1' : String(Math.round(parseFloat(m[4]) * 100) / 100));
    }
    m = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(s);
    if (!m) return 'UNPARSED:' + s;
    var hh = function (n) { return ('0' + (+n).toString(16)).slice(-2); };
    return hh(m[1]) + hh(m[2]) + hh(m[3]) + '@' + (m[4] === undefined ? '1' : String(Math.round(parseFloat(m[4]) * 100) / 100));
  }

  function dump(style, hour) {
    var line = style + '/' + hour;
    TOKENS.forEach(function (t) { line += ' ' + t.slice(2) + '=' + read(resolve('var(' + t + ')')); });
    note(line);
  }

  Promise.resolve().then(function () { return API.getState(); })
    .then(function (st) {
      before = { style: st.settings.style, theme: st.settings.theme };
      var chain = Promise.resolve();
      STYLES.forEach(function (s) {
        ['paper', 'ink'].forEach(function (h) {
          chain = chain.then(function () {
            return API.op({ type: 'settings:update', patch: { style: s, theme: h } })
              .then(function () { return wait(320); });
          }).then(function () { dump(s, h); });
        });
      });
      return chain;
    })
    .then(function () {
      return API.op({ type: 'settings:update', patch: { style: before.style, theme: before.theme } });
    })
    .then(function () { note('RESULT DONE (style/theme restored)'); })
    .catch(function (e) {
      if (before) API.op({ type: 'settings:update', patch: { style: before.style, theme: before.theme } });
      note('RESULT ERROR ' + (e && e.message));
    });
})();
