/* Two things this has to settle with numbers rather than with an opinion:
   1. does the chip's box actually hold the title it was given (the 过行 report), and
   2. when a card is really hovered — the OS cursor on it, so CSS :hover applies and
      the card scales up — is any of what it paints outside the window region?
   The second one is what every earlier probe missed: they moved the cursor onto the
   deck, never onto a card, and a hover is the state being reported as broken. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[F] ' + s); } catch (e) { /* no bridge */ } }
  function num(v) { return Math.round(parseFloat(v) * 10) / 10; }
  var q = function (s) { return document.querySelector(s); };

  var probe = document.createElement('canvas').getContext('2d');

  function rows() {
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll('.todo-card'), function (c) {
      if (c.classList.contains('docked')) return;
      var t = c.querySelector('.card-title');
      if (!t) return;
      var cs = getComputedStyle(c);
      var ts = getComputedStyle(t);
      var cb = c.getBoundingClientRect();
      probe.font = ts.fontWeight + ' ' + ts.fontSize + ' ' + ts.fontFamily;
      var textPx = probe.measureText(t.textContent || '').width;
      var frame = num(cs.paddingLeft) + num(cs.paddingRight) +
        num(cs.borderLeftWidth) + num(cs.borderRightWidth);
      /* negative slack = the title fits with room left; positive = it is being cut */
      out.push({
        el: c,
        title: (t.textContent || '').slice(0, 5),
        chipW: Math.round(cb.width),
        need: Math.round(textPx + frame),
        cut: Math.round(textPx + frame - cb.width),
        ell: ts.textOverflow,
        one: t.scrollHeight <= Math.round(cb.height)
      });
    });
    return out;
  }

  function report(tag) {
    var st = document.body.style;
    note(tag + ' cs=' + st.getPropertyValue('--cs') + ' chipk=' + st.getPropertyValue('--chipk') +
      ' ps=' + st.getPropertyValue('--ps') + ' mode=' + document.body.dataset.mode);
    rows().forEach(function (r) {
      note('  "' + r.title + '" chip=' + r.chipW + ' need=' + r.need + ' slack=' + (-r.cut) +
        (r.cut > 1 ? ' CUT-BY-ellipsis' : ' fits') + ' ell=' + r.ell + ' oneLine=' + r.one);
    });
  }

  /* is every corner of this card's real painted box inside the region that was pushed? */
  function coverage(el) {
    var spans = window.__nd.shape();
    if (!spans || spans === 'off' || spans === 'full-window') return String(spans);
    var b = el.getBoundingClientRect();
    var pts = [[b.left + 0.5, b.top + 0.5], [b.right - 0.5, b.top + 0.5],
      [b.left + 0.5, b.bottom - 0.5], [b.right - 0.5, b.bottom - 0.5],
      [b.left + b.width / 2, b.top + b.height / 2]];
    var lost = pts.filter(function (p) {
      return !spans.some(function (r) {
        return p[0] >= r.x && p[0] < r.x + r.width && p[1] >= r.y && p[1] < r.y + r.height;
      });
    });
    return lost.length ? 'OUTSIDE x' + lost.length + ' @' + Math.round(lost[0][0]) + ',' + Math.round(lost[0][1]) : 'inside';
  }

  var dock = document.getElementById('dock');
  report('rest');
  API.getState().then(function () {
    window.__nd.autoTuck(false);
    window.__nd.tuck(false);
    var r = dock.getBoundingClientRect();
    var n = 0;
    var iv = setInterval(function () {
      n++;
      window.__nd.cursorCmd(r.left + r.width / 2 + (n % 2 ? 4 : -4), r.top + r.height / 2, true);
      if (n > 8) { clearInterval(iv); setTimeout(hoverEach, 1100); }
    }, 90);
  });

  /* A real CSS :hover needs the physical cursor on the card, and no test in this
     suite ever put it there — which is why the hover state was never measured.
     --sc is the product variable the resting transform already reads
     (overlay.css scale(var(--sc,1))); the hover rule replaces it with scale(1.09).
     Setting --sc to 1.09 gives exactly the hovered box through exactly the same
     transition, without needing a cursor. --oscale does not work here: the spread's
     transform never reads it, so the first run of this test measured an unchanged
     box and reported everything as clean. */
  function hoverEach() {
    report('spread');
    var cards = rows();
    var i = 0;
    (function step() {
      if (i >= cards.length) {
        note('HOVER-DONE ' + cards.length + ' cards');
        return;
      }
      var c = cards[i].el;
      var restW = Math.round(c.getBoundingClientRect().width);
      c.style.setProperty('--sc', '1.09');
      setTimeout(function () {
        var grown = Math.round(c.getBoundingClientRect().width);
        var per = Math.round((grown - restW) / 2);
        note('grow#' + i + ' "' + cards[i].title + '" ' + restW + '->' + grown +
          ' each-side=' + per + ' rest-pad=8+5%card=' + (8 + Math.ceil(restW * 0.05)) +
          ' ' + (per > 8 + Math.ceil(restW * 0.05) ? 'STILL-SHORT' : 'pad-covers') +
          ' fresh=' + coverage(c) + ' pushed=' + window.__nd.lag() +
          ' ' + window.__nd.region() + ' ALL=' + window.__nd.leaks(1));
        c.style.removeProperty('--sc');
        setTimeout(function () {
          note('  shrink#' + i + ' ' + Math.round(c.getBoundingClientRect().width) +
            ' fresh=' + coverage(c) + ' pushed=' + window.__nd.lag());
          i++;
          step();
        }, 520);
      }, 520);
    })();
  }
})();
