/* Night glare, measured rather than argued about.

   "对比度过高，很刺眼" is a claim about luminance gaps, and the only honest way to answer it
   is to read the colours the page is actually painted with and print the ratios. A pure white
   ink on a near-black plate runs 16:1 and above, which is the region people describe as
   glaring; the comfortable dark-mode band is roughly 9:1 to 13:1. Too-low accents are reported
   in the same pass, because the obvious way to fix glare — pulling the ink down — is also the
   obvious way to make a secondary colour unreadable.

   Runs in the panel because that is where every surface exists at once: page, module plate,
   head bar, day plate, overdue plate. `data-theme` is written directly and restored. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[N] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var root = document.documentElement;
  var was = { style: root.dataset.style, theme: root.dataset.theme };

  function lum(rgb) {
    var m = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(rgb);
    if (!m) return null;
    var c = [+m[1], +m[2], +m[3]].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function ratio(a, b) {
    var l1 = lum(a), l2 = lum(b);
    if (l1 === null || l2 === null) return null;
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  var probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;left:-9999px';
  function tok(name) {
    probe.style.color = '';
    probe.style.color = 'var(' + name + ')';
    return getComputedStyle(probe).color;
  }
  function bg(sel, fallback) {
    var n = document.querySelector(sel);
    if (!n) return fallback;
    var c = getComputedStyle(n).backgroundColor;
    return /rgba\(0,\s*0,\s*0,\s*0\)/.test(c) ? fallback : c;
  }
  function f(v) { return v === null ? 'n/a' : v.toFixed(1); }

  function survey(style) {
    root.dataset.style = style;
    return wait(260).then(function () {
      var page = bg('body', tok('--paper'));
      var plate = bg('#modClock', page);
      var head = bg('.hud-head', page);
      var day = bg('.day-head', plate);
      var body = ratio(tok('--ink'), page);
      var rows = [
        ['body/page', f(body)],
        ['ink2/page', f(ratio(tok('--ink-2'), page))],
        ['ink/plate', f(ratio(tok('--ink'), plate))],
        ['ink/dayHead', f(ratio(tok('--ink'), day))],
        ['headInk/head', f(ratio(tok('--brick-ink'), head))]
      ];
      var low = null;
      ['--brick', '--vermillion', '--honey', '--sage', '--teal', '--forest', '--slate', '--khaki', '--plum', '--ochre']
        .forEach(function (t) {
          var r = ratio(tok(t), plate);
          if (r !== null && (low === null || r < low.r)) low = { t: t, r: r };
        });
      rows.push(['weakestAccent/plate', low ? low.t.replace('--', '') + ':' + f(low.r) : 'n/a']);
      note(style + ' night ' + rows.map(function (r) { return r[0] + '=' + r[1]; }).join(' '));
      return { style: style, body: body, weak: low ? low.r : null, weakName: low ? low.t : '-' };
    });
  }

  document.documentElement.appendChild(probe);
  root.dataset.theme = 'ink';
  var STYLES = ['ikb', 'blueprint', 'chrome', 'memphis', 'print', 'diner', 'garden', 'console', 'hazard'];
  var out = [];
  STYLES.reduce(function (p, s) {
    return p.then(function () { return survey(s).then(function (r) { out.push(r); }); });
  }, wait(300)).then(function () {
    var glare = out.filter(function (r) { return r.body > 13.5; }).map(function (r) { return r.style + '(' + f(r.body) + ')'; });
    var thin = out.filter(function (r) { return r.weak !== null && r.weak < 3; }).map(function (r) { return r.style + '(' + r.weakName + ' ' + f(r.weak) + ')'; });
    note('RESULT glare>13.5: ' + (glare.length ? glare.join(', ') : 'none') +
      ' | accent<3: ' + (thin.length ? thin.join(', ') : 'none'));
    root.dataset.theme = was.theme;
    root.dataset.style = was.style;
  }).catch(function (e) {
    root.dataset.theme = was.theme;
    root.dataset.style = was.style;
    note('RESULT ERROR ' + (e && e.message));
  });
})();
