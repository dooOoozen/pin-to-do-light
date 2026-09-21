/* The card layer is a separate window with its own stylesheet and its own copy of the
   state, so the deck's plates need the same token comparison as the panel's. It only
   observes: tests/deck-texture.js used to drive the material itself while the panel test
   drove the same shared setting, and the two windows overwrote each other's writes, so
   every report in both windows described whichever material had won last. The tag is
   read off the applied attribute rather than the requested one for the same reason. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[N] ' + s); } catch (e) { /* no bridge */ } }

  var PLATES = ['.deck-face', '.deck-sheet', '.todo-card'];
  /* night is a lit screen, and paper grain belongs to daylight, so a material whose
     texture is grain may drop it after dark; one whose texture is the surface's own
     light may not */
  var LIT = { garden: true };

  var probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:-9999px;width:10px;height:10px';
  document.documentElement.appendChild(probe);
  function resolved(prop, token) {
    probe.style[prop] = '';
    probe.style[prop] = 'var(' + token + ')';
    return getComputedStyle(probe)[prop];
  }
  function last(s) {
    var out = [], d = 0, cur = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '(') d++; else if (ch === ')') d--;
      if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.map(function (x) { return x.trim(); });
  }

  function report() {
    var d = document.documentElement.dataset;
    var tag = (d.style || '?') + '/' + (d.theme || '?');
    var wantImg = resolved('backgroundImage', '--tex-grain');
    var wantSize = resolved('backgroundSize', '--tex-size');
    var style = tag.split('/')[0];
    if (wantImg === 'none') { note('[' + tag + '] paints no surface, skipped'); return; }
    var bad = [];
    PLATES.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) { bad.push(sel + ':absent'); return; }
      var cs = getComputedStyle(el);
      var img = last(cs.backgroundImage);
      var size = last(cs.backgroundSize);
      var grain = img[img.length - 1] || 'none';
      var sz = (size.length === 1 ? size[0] : size[Math.min(img.length, size.length) - 1] || 'auto');
      var why = grain === 'none'
        ? ((LIT[style] || tag.indexOf('/paper') > 0) ? 'CLOBBERED-image' : '')
        : (sz.replace(/\s+/g, '') !== wantSize.replace(/\s+/g, '') ? 'CLOBBERED-size(' + sz + ')' : '');
      if (why) bad.push(sel + ':' + why);
      note('[' + tag + '] ' + sel + ' grain=' +
        (grain.indexOf('url') === 0 ? 'tile' : grain.replace(/\s+/g, '').slice(0, 22)) +
        ' size=' + sz + (why ? '  <<<' + why : ''));
    });
    note('[' + tag + '] deck ' + (bad.length ? 'BAND ' + bad.join(' ') : 'continuous'));
  }

  var seen = '', pending = 0;
  setInterval(function () {
    /* spread the stack first so a real card exists to measure */
    var r = nd.dockRect();
    if (r) nd.cursorFrame((r.left + r.right) / 2, (r.top + r.bottom) / 2, true);
    var d = document.documentElement.dataset;
    var tag = (d.style || '?') + '/' + (d.theme || '?');
    if (tag === seen) return;
    seen = tag;
    clearTimeout(pending);
    /* poll faster than the panel's visits so a material is never skipped, and settle
       before measuring so the numbers and the label are the same material */
    pending = setTimeout(function () { pending = 0; report(); }, 300);
  }, 250);
})();
