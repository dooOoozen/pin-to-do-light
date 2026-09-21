/* Walk every material in both hours and report what actually resolved on the painted
   surfaces, with a contrast ratio for the body text. Reading the tokens is not enough:
   a material that only sets colours still renders a square card box, which is exactly
   the complaint about the first diner pass. Each day stop is held long enough for the
   screenshotter to catch the panel and the deck in the same material. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[T] ' + s); } catch (e) { /* no bridge */ } }
  function q(s) { return document.querySelector(s); }
  var LIST = ['print', 'diner', 'ikb', 'garden', 'p3', 'unp'];

  function lum(rgb) {
    var m = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(rgb);
    if (!m) return 0;
    var c = [+m[1], +m[2], +m[3]].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function ratio(a, b) {
    var l1 = lum(a), l2 = lum(b);
    return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2);
  }

  function report(style, hour) {
    var cs = getComputedStyle(q('#modClock'));
    var ink = getComputedStyle(document.body).color;
    var head = getComputedStyle(q('#modClock .mod-head'));
    var num = getComputedStyle(q('.pd-clock-time'));
    var bad = [];
    if (parseFloat(cs.borderTopLeftRadius) === 0 && style !== 'print' && style !== 'ikb') bad.push('radius');
    if (ratio(ink, cs.backgroundColor) < 4.5) bad.push('LOW-CONTRAST');
    note(style + '/' + hour +
      ' r=' + cs.borderTopLeftRadius + ' edge=' + cs.borderTopColor + ' bw=' + cs.borderTopWidth +
      ' shadow=' + (cs.boxShadow === 'none' ? 'flat' : 'yes') +
      ' ui=' + head.fontFamily.split(',')[0] + ' disp=' + num.fontFamily.split(',')[0] +
      ' paper=' + cs.backgroundColor + ' cr=' + ratio(ink, cs.backgroundColor) +
      (bad.length ? '  <<< ' + bad.join(',') : ''));
  }

  function set(style, hour) {
    return API.op({ type: 'settings:update', patch: { style: style, theme: hour } });
  }
  function wait(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  setTimeout(function () {
    var chain = Promise.resolve();
    LIST.forEach(function (s) {
      chain = chain.then(function () { return set(s, 'paper'); })
        .then(function () { return wait(320); })
        .then(function () { report(s, 'day'); note('SHOT ' + s + '-day'); return wait(2100); })
        .then(function () { return set(s, 'ink'); })
        .then(function () { return wait(320); })
        .then(function () { report(s, 'night'); return wait(260); });
    });
    chain.then(function () { return set('print', 'paper'); }).then(function () {
      note('restored print/paper');
    });
  }, 900);
})();
