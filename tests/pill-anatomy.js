/* What is the pill made of, pixel-wise? The capture shows a clean little plate with the count,
   plus four short lines to its right and two pale plates up and to the left — none of which is
   the pill by intent. The region follows whatever paints, so before guessing which node that
   is, list every element with a box inside a 70 px neighbourhood of the deck, with the
   transform that put it there. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[N] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function name(n) {
    return n.tagName.toLowerCase() +
      (n.id ? '#' + n.id : '') +
      (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : '');
  }
  nd.autoTuck(false); nd.tuck(false);
  wait(2600).then(function () {
    var d = document.querySelector('.deck').getBoundingClientRect();
    var pad = 70;
    note('pill class=' + (document.body.classList.contains('deck-capsule') ? 'ON' : 'off') +
      ' deck=' + Math.round(d.left) + ',' + Math.round(d.top) + ' ' + Math.round(d.width) + 'x' + Math.round(d.height));
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll('*'), function (n) {
      if (n === document.body || n === document.documentElement) return;
      var cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return;
      var r = n.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      if (r.right < d.left - pad || r.left > d.right + pad || r.bottom < d.top - pad || r.top > d.bottom + pad) return;
      out.push(Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top) +
        ' z=' + cs.zIndex + ' tr=' + (cs.transform === 'none' ? '-' : cs.transform) + ' ' + name(n));
    });
    /* biggest first: the plate and its neighbours, not every text node inside them */
    out.sort(function (a, b) {
      var aa = a.match(/^(\d+)x(\d+)/), bb = b.match(/^(\d+)x(\d+)/);
      return (bb[1] * bb[2]) - (aa[1] * aa[2]);
    });
    note(out.length + ' nodes near the deck');
    out.slice(0, 26).forEach(function (line) { note('  ' + line); });
  }).catch(function (e) { note('ERROR ' + (e && e.message)); });
})();
