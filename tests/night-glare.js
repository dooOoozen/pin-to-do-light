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

  /* The first version of this file only compared text against ground, and that is precisely
     how it missed the complaint it was written for: a header bar painted in full chrome yellow
     on a 1% room is 10.3:1 of nothing but light while its own label measures a comfortable
     5:1. So every named element is now read as painted — its own colour on its own background,
     and how bright that background is in absolute terms — because "刺眼" is about the light
     leaving the screen, not about whether a glyph can be resolved. */
  /* Only the surfaces that fill an area. A small accent-filled button at 86% luminance is a
     deliberate object, not a lit room — the first pass flagged every material's primary button
     and buried the two findings that matter, which are a header bar painted in full chrome and
     a day plate left white by a night block that never overrode it. */
  var PARTS = ['body', '.hud', '.modal-panel', '.mod', '.mod-body', '.hud-head', '.mod-head',
               '.day-head', '.stat', '.input', '.mini-row'];
  var SMALL = ['.btn', '.btn.primary', '.idx-mark', '.badge'];
  function parts() {
    var out = [];
    PARTS.forEach(function (sel) {
      var n = document.querySelector(sel);
      if (!n) return;
      var cs = getComputedStyle(n);
      var bgc = cs.backgroundColor;
      if (/rgba\(0,\s*0,\s*0,\s*0\)/.test(bgc)) return;   /* nothing painted, nothing to judge */
      var l = lum(bgc);
      if (l === null) return;
      out.push({ sel: sel, y: l, r: ratio(cs.color, bgc), fg: cs.color, bg: bgc });
    });
    return out;
  }

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
      var ps = parts();
      /* a painted surface brighter than about a quarter of full white is the glare band; the
         three materials nobody complains about sit at 1-8% */
      var bright = ps.filter(function (p) { return p.y > 0.25; });
      var unread = ps.filter(function (p) { return p.r !== null && p.r < 4.5; });
      var small = [];
      SMALL.forEach(function (sel) {
        var n = document.querySelector(sel);
        if (!n) return;
        var cs = getComputedStyle(n);
        if (/rgba\(0,\s*0,\s*0,\s*0\)/.test(cs.backgroundColor)) return;
        var r = ratio(cs.color, cs.backgroundColor);
        if (r !== null && r < 4.5) small.push(sel + '=r' + f(r));
      });
      note(style + ' ' + rows.map(function (r) { return r[0] + '=' + r[1]; }).join(' ') +
        ' | painted: ' + ps.map(function (p) { return p.sel + ' Y' + Math.round(p.y * 100) + ' r' + f(p.r); }).join(' '));
      if (bright.length) note(style + ' GLARE ' + bright.map(function (p) { return p.sel + '=Y' + Math.round(p.y * 100) + '%'; }).join(' '));
      if (unread.length) note(style + ' UNREADABLE ' + unread.map(function (p) {
        return p.sel + '=r' + f(p.r) + ' [' + p.fg + ' on ' + p.bg + ']';
      }).join(' '));
      if (small.length) note(style + ' small-chips ' + small.join(' '));
      return { style: style, body: body, weak: low ? low.r : null, weakName: low ? low.t : '-',
        bright: bright.map(function (p) { return p.sel; }), unread: unread.map(function (p) { return p.sel; }) };
    });
  }

  document.documentElement.appendChild(probe);
  root.dataset.theme = window.__hour || 'ink';
  var STYLES = ['ikb', 'blueprint', 'chrome', 'memphis', 'print', 'diner', 'garden', 'console', 'hazard'];
  var out = [];
  STYLES.reduce(function (p, s) {
    return p.then(function () { return survey(s).then(function (r) { out.push(r); }); });
  }, wait(300)).then(function () {
    var glare = out.filter(function (r) { return r.body > 13.5; }).map(function (r) { return r.style + '(text ' + f(r.body) + ')'; });
    var fields = out.filter(function (r) { return r.bright.length; }).map(function (r) { return r.style + ' ' + r.bright.join(','); });
    var unread = out.filter(function (r) { return r.unread.length; }).map(function (r) { return r.style + ' ' + r.unread.join(','); });
    var thin = out.filter(function (r) { return r.weak !== null && r.weak < 3; }).map(function (r) { return r.style + '(' + r.weakName + ' ' + f(r.weak) + ')'; });
    note('RESULT glare>13.5: ' + (glare.length ? glare.join(', ') : 'none') +
      ' | accent<3: ' + (thin.length ? thin.join(', ') : 'none') +
      ' | field Y>25%: ' + (fields.length ? fields.join(' ; ') : 'none') +
      ' | own-text<4.5: ' + (unread.length ? unread.join(' ; ') : 'none'));
    root.dataset.theme = was.theme;
    root.dataset.style = was.style;
  }).catch(function (e) {
    root.dataset.theme = was.theme;
    root.dataset.style = was.style;
    note('RESULT ERROR ' + (e && e.message));
  });
})();
