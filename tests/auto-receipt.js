/* Proves the timed print in the only way that matters: the card layer is a window whose
   region clips *drawing*, so a machine that is not inside the region simply does not
   appear, no matter what the DOM says. This opens it the way the schedule does, then asks
   the region whether each corner of the rig would be shown, and reports whether the file
   landed. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[A] ' + s); } catch (e) { /* no bridge */ } }
  setTimeout(function () {
    if (!window.Receipt) { note('Receipt missing'); return; }
    API.getState().then(function (st) {
      var r = nd.dockRect();
      window.Receipt.auto(st, r ? { x: r.left - 150, y: r.top } : null);
      setTimeout(function () {
        var rig = document.querySelector('.rcp');
        if (!rig) { note('NO RIG'); return; }
        var m = document.querySelector('.rcp-machine').getBoundingClientRect();
        var side = document.querySelector('.rcp-side').getBoundingClientRect();
        var box = rig.getBoundingClientRect();
        var pts = [['machine-tl', m.left, m.top], ['machine-br', m.right - 1, m.bottom - 1],
                   ['side-tl', side.left, side.top], ['side-br', side.right - 1, side.bottom - 1],
                   ['rig-bl', box.left, box.bottom - 1]];
        var out = pts.map(function (p) {
          return p[0] + '=' + (nd.swallowsAt(p[1], p[2]) ? 'shown' : 'CLIPPED');
        });
        note('auto rig=' + Math.round(box.width) + 'x' + Math.round(box.height) +
          ' at ' + Math.round(box.left) + ',' + Math.round(box.top) + ' | ' + out.join(' '));
      }, 1400);
      setTimeout(function () {
        var rig = document.querySelector('.rcp');
        note(rig ? 'STILL OPEN after 16s — it should have gone' : 'rig gone, as scheduled');
      }, 16000);
    });
  }, 1500);
})();
