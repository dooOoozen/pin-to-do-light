/* The clipped corner has come back twice, so this stops asserting that the region covers
   what the page computed and asks where the painted card actually ends up. For every card
   that paints, it samples the four corners and the midpoints of the left and right edges,
   and for each miss it says which of the two possible clippers is responsible: the region
   never claimed that pixel, or the pixel is outside the window so no region can claim it.
   A card is also measured while hovered and while the deck is spread wide, because the
   long-title chips are the ones the user reports cut. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[C] ' + s); } catch (e) { /* no bridge */ } }

  function cards() {
    /* only chips that actually paint belong in the region, so only those are fair game
       here: the spread lays every card out with a real size while the deck is collapsed,
       and measuring one of those reports a clip that no user can see */
    return Array.prototype.slice.call(document.querySelectorAll('.todo-card')).filter(function (c) {
      if (!c.offsetWidth || !c.offsetHeight) return false;
      var cs = getComputedStyle(c);
      if (cs.opacity === '0' || cs.visibility === 'hidden' || cs.display === 'none') return false;
      var b = c.getBoundingClientRect();
      return b.right > 0 && b.bottom > 0 && b.left < window.innerWidth && b.top < window.innerHeight;
    });
  }

  /* a dock tucked against an edge sits mostly outside the window, so its centre is not a
     point the layer can ever be hovered at — aim at the sliver that is on screen */
  function aim() {
    var r = nd.dockRect();
    if (!r) return null;
    return {
      x: Math.min(window.innerWidth - 4, Math.max(4, (r.left + r.right) / 2)),
      y: Math.min(window.innerHeight - 4, Math.max(4, (r.top + r.bottom) / 2))
    };
  }

  function probe(tag) {
    var win = { w: window.innerWidth, h: window.innerHeight };
    var misses = 0, outside = 0, checked = 0;
    cards().forEach(function (c, i) {
      var b = c.getBoundingClientRect();
      var pts = [['tl', b.left, b.top], ['tr', b.right - 1, b.top],
                 ['br', b.right - 1, b.bottom - 1], ['bl', b.left, b.bottom - 1],
                 ['ml', b.left, (b.top + b.bottom) / 2], ['mr', b.right - 1, (b.top + b.bottom) / 2]];
      var bad = [];
      pts.forEach(function (p) {
        checked++;
        var inWin = p[1] >= 0 && p[2] >= 0 && p[1] < win.w && p[2] < win.h;
        if (!inWin) { outside++; bad.push(p[0] + ':OUTSIDE-WINDOW'); return; }
        if (!nd.swallowsAt(p[1], p[2])) { misses++; bad.push(p[0] + ':REGION-SHORT'); }
      });
      note(tag + ' card' + i + ' ' + Math.round(b.width) + 'x' + Math.round(b.height) +
        ' @' + Math.round(b.left) + ',' + Math.round(b.top) +
        ' rot=' + (getComputedStyle(c).getPropertyValue('--rot') || '0').trim() +
        (bad.length ? '  <<<' + bad.join(' ') : '  ok'));
    });
    note(tag + ' window=' + win.w + 'x' + win.h + ' cards=' + cards().length +
      ' points=' + checked + ' regionShort=' + misses + ' outsideWindow=' + outside);
  }

  var step = 0;
  /* name the spans that are the nearest candidates for covering the first painting card's
     top-left point, so a miss says whether the region was never asked to cover that pixel
     or the coordinate spaces disagree */
  function why(tag) {
    var c = cards()[0];
    if (!c) { note(tag + ' nothing painting'); return; }
    var b = c.getBoundingClientRect();
    var spans = nd.shape();
    var d = nd.dockRect() || { left: 0, top: 0, right: 0, bottom: 0 };
    note(tag + ' null=' + (spans === null) + ' spans=' + (spans ? spans.length : -1) +
      ' point=' + Math.round(b.left) + ',' + Math.round(b.top) +
      ' card=' + Math.round(b.left) + ',' + Math.round(b.top) + ',' + Math.round(b.width) + 'x' + Math.round(b.height) +
      ' dock=' + Math.round(d.left) + ',' + Math.round(d.top) + ',' +
      Math.round(d.right - d.left) + 'x' + Math.round(d.bottom - d.top));
    if (!spans) return;
    var rows = spans.filter(function (r) { return b.top >= r.y && b.top < r.y + r.height; });
    note(tag + ' rowsAtY=' + rows.length +
      ' xRanges=' + rows.slice(0, 6).map(function (r) { return Math.round(r.x) + '-' + Math.round(r.x + r.width); }).join(' ') +
      ' minX=' + Math.min.apply(null, spans.map(function (r) { return r.x; })) +
      ' maxX=' + Math.max.apply(null, spans.map(function (r) { return r.x + r.width; })));
  }

  setInterval(function () {
    var a = aim();
    if (!a) return;
    step++;
    if (step === 2) { nd.cursorFrame(a.x, a.y, true); }
    if (step === 5) { note('state mode=' + nd.mode() + ' tucked=' + nd.hoverInfo().tucked + ' painting=' + cards().length); why('why'); }
    if (step === 6) { probe('spread'); }
    if (step === 8) {
      /* hover the widest painting card, which is the one reported cut */
      var wide = cards().sort(function (x, y) {
        return y.getBoundingClientRect().width - x.getBoundingClientRect().width;
      })[0];
      if (wide) {
        var wb = wide.getBoundingClientRect();
        nd.cursorFrame(Math.min(window.innerWidth - 4, (wb.left + wb.right) / 2), (wb.top + wb.bottom) / 2, true);
      }
    }
    if (step === 11) { probe('hovered'); }
    if (step === 13) { nd.cursorFrame(Math.max(4, a.x - 420), a.y, true); }
    if (step === 16) { probe('left'); note('[C] clip probe done'); }
    /* the self-heal, run while the deck is still spread: grow a card with no event at
       all, which is what a stale region looks like, and show the watchdog notices */
    if (step === 7) {
      var c = cards()[0];
      if (!c) { note('[C] selfheal skipped, nothing painting'); return; }
      c.style.transform = 'scale(1.14)';
      note('[C] selfheal grew card0 lag@0=' + nd.lag());
      setTimeout(function () { note('[C] selfheal lag@250=' + nd.lag()); }, 250);
      setTimeout(function () {
        var after = nd.lag();
        note('[C] selfheal lag@900=' + after + (String(after).indexOf('LAG') === 0 ? '  <<<NOT HEALED' : '  healed'));
        c.style.transform = '';
      }, 900);
    }
  }, 420);
})();
