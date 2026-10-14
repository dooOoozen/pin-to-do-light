/* Applies the user's own palette on top of the theme defaults.

   The tokens live in theme.css; this only writes what the colour lab has actually
   been used to change, as inline custom properties on the root — which beat the
   stylesheet — and clears them again when the theme switches. Everything with an
   alpha (rules, grid, watermark, glow) is derived from --ink by color-mix in the
   stylesheet, so retuning the ink carries them along and they do not need their own
   pickers. */
(function (g) {
  'use strict';

  /* the tokens the lab drives, grouped the way the panels are read. `w` is where that colour
     actually paints — the list is long enough that 压暗 and 面板底 are not self-explanatory,
     and a picker with no address is a guess. `src` and `a` mark a line token: it is drawn from
     one colour at one strength (theme.css mixes them), so the lab gets a colour picker for the
     source and a slider for the strength instead of one picker that would flatten the alpha. */
  var TOKENS = [
    { group: '纸面 / PAPER', items: [
      { v: '--paper', n: '底色', w: '面板与卡片层的整体底色' },
      { v: '--paper-hi', n: '提亮', w: '卡片正面、输入框、弹窗面板' },
      { v: '--paper-lo', n: '压暗', w: '左导航底、时间轴栏、进度槽' },
      { v: '--paper-dim', n: '面板底', w: '悬停时的行底、环形图未完成那段弧' },
      { v: '--surface-hi', n: '输入卡', w: '新建任务输入区的表面' },
      { v: '--head-hi', n: '标题条', w: '模块与弹窗标题栏的底色' },
      { v: '--field-focus', n: '输入聚焦', w: '输入框获得焦点时的底色' },
      { v: '--plate-mod', n: '模块底板', w: '仪表盘每块模块自己的板底' },
      { v: '--cream', n: '奶油', w: '图标按钮选中态、计时徽章底' },
      /* one colour and one alpha across .hud / .hud-thin / .modal-panel / .plan-pop; the
         fallback is the surface colour those panels use when the material says nothing */
      { v: '--pop-bg', n: '弹窗背景', w: '弹框、模块面板、浮层的底；滑条定它有多透',
        src: '--pop-ink', a: '--pop-a', fb: '--paper' }
    ] },
    { group: '分组底板 / PLATES', items: [
      { v: '--plate-day', n: '日期分组底', w: '台账里日期分组的底色' },
      { v: '--plate-today', n: '今天分组底', w: '「今天」那一组的底色' },
      { v: '--plate-overdue', n: '逾期分组底', w: '逾期日期组的底色' }
    ] },
    { group: '墨色 / INK', items: [
      { v: '--ink', n: '正文', w: '正文文字；未钉住的线条默认都从它派生' },
      { v: '--ink-2', n: '次级', w: '次要文字与图标' },
      { v: '--ink-3', n: '三级', w: '最弱的提示文字、输入占位符' }
    ] },
    { group: '线条 / LINES', items: [
      { v: '--edge', n: '描边', w: '面板、卡片、按钮外框那圈实线', src: '--edge-ink', a: '--edge-a' },
      { v: '--rule', n: '细虚线', w: '列表行下沿、时间轴的横线与竖轴', src: '--rule-ink', a: '--rule-a' },
      { v: '--rule-strong', n: '粗虚线', w: '模块标题下沿、卡盒菜单栏分隔', src: '--rule-strong-ink', a: '--rule-strong-a' },
      { v: '--grid-line', n: '网格细线', w: '背景方格纸的小格', src: '--grid-line-ink', a: '--grid-line-a' },
      { v: '--grid-line-bold', n: '网格粗线', w: '背景方格纸的大格', src: '--grid-line-bold-ink', a: '--grid-line-bold-a' },
      { v: '--hatch-line', n: '斜纹', w: '卡片背面的 45° 斜纹', src: '--hatch-line-ink', a: '--hatch-line-a' },
      { v: '--wm-ink', n: '水印', w: '卡片右下角的大数字水印', src: '--wm-src', a: '--wm-a' },
      { v: '--hit-line', n: '拖拽高亮', w: '侧栏宽度拖拽条悬停时', src: '--hit-line-ink', a: '--hit-line-a' },
      { v: '--ink-glow', n: '字晕', w: '发光标题的文字光晕', src: '--ink-glow-ink', a: '--ink-glow-a' },
      { v: '--memo-rule', n: '信纸线', w: '备忘录的横线', src: '--memo-rule-ink', a: '--memo-rule-a' }
    ] },
    { group: '强调 / ACCENTS', items: [
      { v: '--brick', n: '砖红', w: '品牌标题、选中态、卡盒标题条底色' },
      { v: '--brick-ink', n: '砖红字', w: '压在强调色块上的文字' },
      { v: '--vermillion', n: '朱红', w: '关闭按钮、逾期标记与逾期组标题' },
      { v: '--honey', n: '蜜黄', w: '低优先圆点、悬停计时读数、今天的时间轴列' },
      { v: '--sage', n: '鼠尾草', w: '最高优先圆点、番茄钟读数' },
      { v: '--forest', n: '森绿', w: '完成态的进度条与文字' },
      { v: '--forest-ink', n: '森绿字', w: '绿底上的文字' },
      { v: '--teal', n: '青', w: '今日完成环形图的已完成段、登记成功提示' },
      { v: '--slate', n: '石板蓝', w: '部分材质的序号块与信纸线' },
      { v: '--slate-ink', n: '蓝底字', w: '蓝底上的文字' },
      { v: '--khaki', n: '卡其', w: '热力图次高档、警告提示条' },
      { v: '--plum', n: '李紫', w: '备用强调槽位，当前没有界面用它' },
      { v: '--ochre', n: '赭石', w: '快速新建的加号按钮、热力图最高档' }
    ] }
  ];

  var HEX = /^#[0-9a-fA-F]{3,8}$/;
  var PERCENT = /^\d+(?:\.\d+)?%$/;
  var applied = [];

  /* two independent axes: the material (data-style) and the hour (data-theme). The colour lab
     writes per material *and* per hour, because a pinned --brick on 黑黄战术 is a decision about
     that material; sharing one map between all ten, which is what this used to do, meant an edit
     made in one material silently recoloured every other one.
     Names describe the visual language, not any particular work: `v` stays the stable
     key persisted in settings, `n` is what the settings card shows. */
  var STYLES = [
    { v: 'blueprint', n: '图纸 BLUEPRINT', d: '黑白的磨砂面：半透明灰板、发丝描边、大圆角、柔和落影',
      sw: ['#e8e8e6', '#f7f7f6', '#1b1c1d', '#87888a', '#cbcac6'] },
    { v: 'print', n: '印刷 1971', d: '方角、硬阴影、纸张颗粒、等宽字',
      sw: ['#ede5d3', '#8d3a27', '#6aa690', '#47597c', '#eba93a'] },
    { v: 'diner', n: '餐厅 DINER', d: '搪瓷圆角、铬条、柔和阴影、几何字',
      sw: ['#f4ece0', '#c74551', '#6fb5a3', '#44607f', '#dcae63'] },
    { v: 'ikb', n: '群青构成 IKB', d: '构成主义平面：纯平、粗黑线、克莱因蓝',
      sw: ['#f4f2ec', '#002fa7', '#d8232a', '#e0c040', '#12141a'] },
    { v: 'garden', n: '晨雾花园 GARDEN', d: '桃红到奶油的渐变天空、薄荷格线、深青墨',
      sw: ['#f98ba0', '#ef5d76', '#58d99a', '#17342f', '#f5c469'] },
    { v: 'frost', n: '雾绿磨砂 FROST', d: '薄荷灰房间上的半透明磨砂面：青色可点、发丝描边、大圆角',
      sw: ['#dfe8e4', '#2f9e94', '#17282e', '#f6faf8', '#5d7fd0'] },
    { v: 'console', n: '指令台 RETRO', d: '复古任务台：橙色安全色、螺钉法兰、扫描线',
      sw: ['#e9e3d5', '#d2601a', '#1f6f8b', '#23251f', '#c9a227'] },
    { v: 'memphis', n: '紫电拼贴 COLLAGE', d: '白底叠色块：电紫与钴蓝、硬偏色阴影、直角',
      sw: ['#f1eff6', '#6d28d9', '#2047d6', '#3a3350', '#171225'] },
    { v: 'hazard', n: '黑黄战术 HI-VIS', d: '高视认黄与黑：斜切碎片、条码遥测、四角瞄准框',
      sw: ['#e6e6e1', '#0d0f0c', '#c9d400', '#4a5057', '#f3f3ee'] },
    { v: 'chrome', n: '铬黄丝网 CHROME', d: '白纸大块黄：丝网标题条、硬偏移块、粗黑线、直角',
      sw: ['#fbfaf5', '#14120d', '#f5c518', '#d8341a', '#6f6ae8'] }
  ];

  function themeOf(settings) {
    return settings && settings.theme === 'ink' ? 'ink' : 'paper';
  }

  function styleOf(settings) {
    var s = settings && settings.style;
    for (var i = 0; i < STYLES.length; i++) if (STYLES[i].v === s) return s;
    return STYLES[0].v;
  }

  function apply(settings) {
    var root = document.documentElement;
    var theme = themeOf(settings);
    root.dataset.theme = theme;
    var style = styleOf(settings);
    root.dataset.style = style;
    /* the third axis: which material, which hour, and whether anything is rounded at all.
       Default is 'on' because the setting is new — an old data file has no key to read. */
    root.dataset.round = settings && settings.roundCorners === false ? 'off' : 'on';
    applied.forEach(function (k) { root.style.removeProperty(k); });
    applied = [];
    var per = settings && settings.palette && settings.palette[style];
    var bag = per && per[theme];
    if (!bag) return;
    Object.keys(bag).forEach(function (k) {
      /* a colour pin or a line strength — those are the only two shapes the lab can produce,
         and anything else (a stray "auto", an old key) is dropped rather than written to the root */
      if (!HEX.test(bag[k]) && !PERCENT.test(bag[k])) return;
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

  /* How strong a line actually is right now: Chromium hands a translucent colour back as
     color(srgb r g b / a) or rgba(...,a), and the strength slider has to start on that number,
     not on whatever --x-a happens to spell — most materials never write it and ride the fallback
     in the mix. 1 for anything unparsable, so a broken read leaves the line opaque rather than
     silently invisible. */
  function alphaOf(css) {
    var s = String(css || '').trim();
    if (s === 'transparent') return 0;
    var m = /color\(\s*srgb[^)]*?\/\s*([\d.]+)/.exec(s);
    if (m) return parseFloat(m[1]);
    m = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(s);
    if (m) return parseFloat(m[1]);
    return 1;
  }

  /* Ink for text sitting *on* a filled block. The group palette contains cream and honey,
     and the deck band paints its head with the group colour while the label used to stay
     the light brick-ink — pale on pale, unreadable. Choose by the block's own luminance. */
  function inkOn(hex) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return '#fbf6ea';
    var s = m[1];
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    var lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return lum > 145 ? '#17140e' : '#fbf6ea';
  }

  g.NeonTheme = {
    TOKENS: TOKENS,
    STYLES: STYLES,
    apply: apply,
    themeOf: themeOf,
    styleOf: styleOf,
    current: current,
    toHex: toHex,
    resolve: resolveColour,
    alphaOf: function (token) { return alphaOf(resolveColour('var(' + token + ')')); },
    inkOn: inkOn,
    isHex: function (v) { return HEX.test(v); }
  };
})(window);
