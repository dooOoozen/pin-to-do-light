/* What a module head costs when the panel is small.

   The complaint (p2) was that the title bar ate two and three rows at narrow widths, so this
   measures the head itself: its height, how many lines that is, whether the title had to give
   up characters, and whether the ⠿ grip is gone. The threshold that matters is one line — the
   head is chrome, and the moment it wraps it stops labelling the module and starts hiding it. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[M] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  /* the panel is revealed only once its views are built, and a head measured before that is
     0x0 — which every threshold below would have passed. Wait for real geometry, and say so
     out loud when it never comes. */
  function ready() {
    var m = document.querySelector('.mod .mod-head');
    return m && m.getBoundingClientRect().height > 0;
  }
  function run() {
  var mods = Array.prototype.slice.call(document.querySelectorAll('.mod'));
  var wide = [], tall = [], grip = 0;
  note('panel ' + window.innerWidth + 'x' + window.innerHeight + ' mods=' + mods.length);
  mods.forEach(function (m) {
    var head = m.querySelector('.mod-head');
    if (!head) { note(m.dataset.mod + ' NO HEAD'); return; }
    if (m.querySelector('.mod-grip')) grip++;
    var title = head.querySelector('span:not(.spacer):not(.idx-mark)');
    var hb = head.getBoundingClientRect();
    /* "how many rows" is answered by the children, not by dividing the height by the title's
       line-height: the index badge is taller than the text it sits beside, so a single row
       measures ~25px and the ratio read as 2.1 lines on a head that has exactly one */
    var rows = {};
    Array.prototype.slice.call(head.children).forEach(function (c) {
      var r = c.getBoundingClientRect();
      if (!r.height && !r.width) return;
      rows[Math.round((r.top + r.bottom) / 2 / 6) * 6] = 1;
    });
    var lineCount = Object.keys(rows).length;
    var clipped = title && title.scrollWidth > title.clientWidth + 1;
    if (lineCount > 1) tall.push(m.dataset.mod + '=' + lineCount + ' rows @' + Math.round(hb.height) + 'px');
    if (clipped) wide.push(m.dataset.mod + '("' + (title.textContent || '').trim().slice(0, 12) + '…")');
    note(m.dataset.mod + ' head=' + Math.round(hb.width) + 'x' + Math.round(hb.height) +
      ' rows=' + lineCount + ' title=' + (title ? (title.clientWidth) + '/' + title.scrollWidth : '-') +
      (clipped ? ' ELLIPSIS' : '') + ' children=' + head.children.length);
  });
  note('RESULT ' + (tall.length || grip ? 'FAIL ' + (grip ? grip + ' grips still mounted; ' : '') +
    (tall.length ? 'heads over one line: ' + tall.join(', ') : '') :
    'PASS every head is a single row and no grip remains' +
    (wide.length ? ' (' + wide.length + ' titles ellipsised: ' + wide.join(' ') + ')' : '')));
  }
  /* the panel opens on whatever view it was left on, and the modules only have geometry on
     仪表盘 — measuring a hidden view is how this probe first reported seven 0x0 heads as a
     clean pass */
  var nav = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
    .filter(function (b) { return (b.textContent || '').indexOf('仪表盘') >= 0; })[0];
  if (nav) nav.click();
  var tries = 0;
  (function poll() {
    if (ready()) return run();
    if (++tries > 24) { note('RESULT ERROR no head ever had height — the panel never painted'); return; }
    wait(250).then(poll);
  })();
})();
