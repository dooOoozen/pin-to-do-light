/* The panel half of the candidate sweep — same wall-clock schedule as tests/cand-sweep.js,
   plus the two numbers that decide whether a candidate is real: the contrast of body text on
   the module plate, and the weakest of the three priority title colours against it. The
   reference images promise a look; only the ratio says whether a person can read a task. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  var SLOT = 3200;
  var STATES = [];
  [['poster', ['1', '2', '3', '4']], ['chrome', ['1', '2', '3']]].forEach(function (pair) {
    pair[1].forEach(function (mv) {
      STATES.push([pair[0], mv, 'paper']);
      STATES.push([pair[0], mv, 'ink']);
    });
  });
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
  var probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;left:-9999px';
  function tokenColour(name) { probe.style.color = ''; probe.style.color = 'var(' + name + ')'; return getComputedStyle(probe).color; }
  function measure(tag) {
    var plate = document.querySelector('#modClock');
    if (!plate) { note(tag + ' no-plate'); return; }
    var cs = getComputedStyle(plate);
    var ink = getComputedStyle(document.body).color;
    /* a wireframe variant makes the module plate transparent on purpose, and the ratio of
       text against `rgba(0,0,0,0)` is a measurement of nothing — the pixels the text sits on
       are the page ground, so that is what gets compared */
    var plateBg = cs.backgroundColor;
    if (/rgba\(0,\s*0,\s*0,\s*0\)/.test(plateBg)) {
      plateBg = getComputedStyle(document.body).backgroundColor;
    }
    var low = null;
    ['--vermillion', '--ochre', '--khaki'].forEach(function (tk) {
      var cr = Number(ratio(tokenColour(tk), plateBg));
      if (low === null || cr < low.cr) low = { tk: tk, cr: cr };
    });
    /* the window's own frame, not the plate's: this line is what the screenshotter aims at,
       and the plate is 0x0 before the panel has rendered anything */
    var dpr = window.devicePixelRatio || 1;
    note(tag + ' cr=' + ratio(ink, plateBg) + ' weakest=' + low.tk + ':' + low.cr +
      ' radius=' + cs.borderTopLeftRadius + ' edge=' + cs.borderTopColor + ' bw=' + cs.borderTopWidth +
      ' shadow=' + (cs.boxShadow === 'none' ? 'flat' : 'yes') +
      ' rect=' + Math.round(window.screenX * dpr) + ',' + Math.round(window.screenY * dpr) +
      ' ' + Math.round(window.outerWidth * dpr) + 'x' + Math.round(window.outerHeight * dpr));
  }
  document.documentElement.appendChild(probe);
  var last = -1;
  function tick() {
    var i = Math.floor(Date.now() / SLOT) % STATES.length;
    var s = STATES[i];
    var root = document.documentElement;
    root.dataset.style = s[0];
    root.dataset.mv = s[1];
    root.dataset.theme = s[2];
    if (i !== last) {
      last = i;
      measure(i + ' ' + s[0] + '/' + s[1] + '/' + s[2]);
    }
  }
  /* every frame, not every 240 ms: the dashboard rewrites data-style from settings on its
     own clock, and a slower assertion means the panel renders the user's saved material
     while the sweep measures the candidate it set a frame earlier — the numbers were right
     and the pixels were wrong */
  (function loop() { tick(); requestAnimationFrame(loop); })();
})();
