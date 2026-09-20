/* Applies the user's own palette on top of the theme defaults.

   The tokens live in theme.css; this only writes what the colour lab has actually
   been used to change, as inline custom properties on the root — which beat the
   stylesheet — and clears them again when the theme switches. Everything with an
   alpha (rules, grid, watermark, glow) is derived from --ink by color-mix in the
   stylesheet, so retuning the ink carries them along and they do not need their own
   pickers. */
(function (g) {
  'use strict';

  /* the opaque tokens worth exposing, grouped the way the panels are read */
  var TOKENS = [
    { group: '纸面 / PAPER', items: [
      { v: '--paper', n: '底色' },
      { v: '--paper-hi', n: '提亮' },
      { v: '--paper-lo', n: '压暗' },
      { v: '--paper-dim', n: '面板底' },
      { v: '--surface-hi', n: '输入卡' },
      { v: '--head-hi', n: '标题条' },
      { v: '--field-focus', n: '输入聚焦' },
      { v: '--plate-mod', n: '模块底板' },
      { v: '--cream', n: '奶油' }
    ] },
    { group: '分组与信纸 / PLATES', items: [
      { v: '--plate-day', n: '日期分组底' },
      { v: '--plate-today', n: '今天分组底' },
      { v: '--plate-overdue', n: '逾期分组底' },
      { v: '--memo-rule', n: '信纸横线' }
    ] },
    { group: '墨色 / INK', items: [
      { v: '--ink', n: '正文' },
      { v: '--ink-2', n: '次级' },
      { v: '--ink-3', n: '三级' }
    ] },
    { group: '强调 / ACCENTS', items: [
      { v: '--brick', n: '砖红' },
      { v: '--brick-ink', n: '砖红字' },
      { v: '--vermillion', n: '朱红' },
      { v: '--honey', n: '蜜黄' },
      { v: '--sage', n: '鼠尾草' },
      { v: '--forest', n: '森绿' },
      { v: '--forest-ink', n: '森绿字' },
      { v: '--teal', n: '青' },
      { v: '--slate', n: '石板蓝' },
      { v: '--slate-ink', n: '蓝底字' },
      { v: '--khaki', n: '卡其' },
      { v: '--plum', n: '李紫' },
      { v: '--ochre', n: '赭石' }
    ] }
  ];

  var HEX = /^#[0-9a-fA-F]{3,8}$/;
  var applied = [];

  /* two independent axes: the material (data-style) and the hour (data-theme). The
     palette the colour lab edits is keyed by theme, so a style swap keeps the user's
     pinned colours for that day/night half. */
  var STYLES = [
    { v: 'print', n: '印刷 1971', d: '方角、硬阴影、纸张颗粒、等宽字',
      sw: ['#ede5d3', '#8d3a27', '#6aa690', '#47597c', '#eba93a'] },
    { v: 'diner', n: '餐厅 DINER', d: '搪瓷圆角、铬条、柔和阴影、几何字',
      sw: ['#f4ece0', '#c74551', '#6fb5a3', '#44607f', '#dcae63'] }
  ];

  function themeOf(settings) {
    return settings && settings.theme === 'ink' ? 'ink' : 'paper';
  }

  function styleOf(settings) {
    var s = settings && settings.style;
    for (var i = 0; i < STYLES.length; i++) if (STYLES[i].v === s) return s;
    return 'print';
  }

  function apply(settings) {
    var root = document.documentElement;
    var theme = themeOf(settings);
    root.dataset.theme = theme;
    root.dataset.style = styleOf(settings);
    applied.forEach(function (k) { root.style.removeProperty(k); });
    applied = [];
    var bag = settings && settings.palette && settings.palette[theme];
    if (!bag) return;
    Object.keys(bag).forEach(function (k) {
      if (!HEX.test(bag[k])) return;
      root.style.setProperty(k, bag[k]);
      applied.push(k);
    });
  }

  /* what a picker should show: the value in effect right now, override or stylesheet.
     Chromium resolves a colour property to rgb()/rgba(), and an <input type=color>
     only accepts #rrggbb, so normalise here rather than at every call site. */
  function toHex(v) {
    if (!v) return '#000000';
    if (v.charAt(0) === '#') {
      if (v.length === 4) {
        return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
      }
      return v.slice(0, 7);
    }
    var h = function (n) { return ('0' + (+n).toString(16)).slice(-2); };
    var m = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(v);
    if (m) return '#' + h(m[1]) + h(m[2]) + h(m[3]);
    /* a color-mix() result comes back in the modern notation with 0..1 channels, which
       is what every derived plate in the stylesheet resolves to */
    var s = /color\(\s*srgb\s+([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(v);
    if (!s) return '#000000';
    var f = function (x) {
      return h(Math.max(0, Math.min(255, Math.round(parseFloat(x) * 255))));
    };
    return '#' + f(s[1]) + f(s[2]) + f(s[3]);
  }

  /* A custom property whose value is a color-mix() computes to the literal function
     text, which is not a colour an <input type=color> can hold. Assigning it to a real
     property makes Chromium evaluate it, so read the picker's starting value that way. */
  var probe = null;
  function resolveColour(css) {
    if (!probe) {
      probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;visibility:hidden';
      document.documentElement.appendChild(probe);
    }
    probe.style.color = '';
    probe.style.color = css;
    return getComputedStyle(probe).color;
  }

  function current(token) {
    return toHex(resolveColour('var(' + token + ')'));
  }

  g.NeonTheme = {
    TOKENS: TOKENS,
    STYLES: STYLES,
    apply: apply,
    themeOf: themeOf,
    styleOf: styleOf,
    current: current,
    toHex: toHex,
    isHex: function (v) { return HEX.test(v); }
  };
})(window);
