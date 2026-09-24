/* The halftone is gone from every material that carried one, and this keeps it gone: the
   dot lattice reached the screen through exactly one variable (--tex-grain), so the check is
   "no surface resolves to a small-period radial-gradient", read off the painted element
   rather than off the stylesheet — a `color-mix()` token read from :root hands back the
   literal text, not what was painted. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[D] ' + s); } catch (e) { /* no bridge */ } }
  var STYLES = ['print', 'diner', 'ikb', 'garden', 'poster', 'console', 'blueprint', 'memphis', 'hazard'];
  var SURFACES = ['body', '.hud', '.modal-panel', '.deck-face', '.todo-card'];
  var root = document.documentElement;
  var fails = [];
  /* a lattice is a radial-gradient whose tile is under 14px; the discs that belong to a
     material — enamel, mylar, the four screws on the console plate — are single gradients
     sized in percent or tens of px, and those stay */
  function isLattice(bg, size) {
    if (!/radial-gradient/.test(bg)) return false;
    var m = /(\d+(?:\.\d+)?)px/.exec(size || '');
    return !!m && Number(m[1]) < 14;
  }
  function sweep(hour) {
    STYLES.forEach(function (st) {
      root.dataset.style = st;
      root.dataset.theme = hour;
      SURFACES.forEach(function (sel) {
        var n = sel === 'body' ? document.body : document.querySelector(sel);
        if (!n) return;
        var cs = getComputedStyle(n);
        if (isLattice(cs.backgroundImage, cs.backgroundSize)) {
          fails.push(st + '/' + hour + ' ' + sel);
          note('FAIL lattice still painted: ' + st + '/' + hour + ' ' + sel +
            ' bg=' + cs.backgroundImage.slice(0, 70) + ' size=' + cs.backgroundSize);
        }
      });
    });
  }
  setTimeout(function () {
    sweep('paper');
    sweep('ink');
    root.dataset.style = 'console';
    root.dataset.theme = 'paper';
    note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(', ') : 'PASS (' + STYLES.length + ' materials × 2 hours × ' + SURFACES.length + ' surfaces)'));
  }, 700);
})();
