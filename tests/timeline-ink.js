/* The axis paints a block in its group's colour and used to pick the type colour from
   the theme, so a pale group (cream, honey) got the light ink at night and the title
   vanished. This forces the case rather than waiting for it: rename a group to the
   palest colour in the palette, measure every block that actually paints in both hours,
   and put the group back — reporting the old value first so a failure to restore is
   visible instead of silently altering the user's board. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[K] ' + s); } catch (e) { /* no bridge */ } }

  function lum(rgb) {
    var m = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(rgb);
    if (!m) return 0;
    var c = [+m[1], +m[2], +m[3]].map(function (v) {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function ratio(a, b) {
    var l1 = lum(a), l2 = lum(b);
    return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2);
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function measure(tag) {
    var blocks = Array.prototype.slice.call(document.querySelectorAll('.tk-blk'));
    if (!blocks.length) { note(tag + ' NO BLOCKS on the axis'); return 0; }
    var low = 99, worst = '';
    blocks.forEach(function (b) {
      var cs = getComputedStyle(b);
      var name = b.querySelector('.tk-blk-n');
      var cr = Number(ratio(cs.color, cs.backgroundColor));
      /* the title is the text that has to be readable; the clock line is smaller */
      if (name) {
        var ncs = getComputedStyle(name);
        cr = Math.min(cr, Number(ratio(ncs.color, cs.backgroundColor)));
      }
      if (cr < low) { low = cr; worst = cs.backgroundColor + ' / ' + cs.color; }
    });
    note(tag + ' blocks=' + blocks.length + ' worstContrast=' + low.toFixed(2) + ' at ' + worst +
      (low < 4.5 ? '  <<<UNREADABLE' : ''));
    return low;
  }

  API.getState().then(function (st) {
    /* recolour the group that actually owns a block on the axis — repainting an empty
       group measures nothing, which is exactly what the first run of this did */
    var blocks = Array.prototype.slice.call(document.querySelectorAll('.tk-blk'));
    if (!blocks.length) { note('NO BLOCKS on the axis, nothing to measure'); return; }
    var byId = {};
    st.todos.forEach(function (t) { byId[t.id] = t; });
    var byGroup = {};
    st.groups.forEach(function (g) { byGroup[g.id] = g; });
    var gid = null;
    for (var i = 0; i < blocks.length && !gid; i++) {
      var t = byId[blocks[i].dataset.todo];
      if (t && byGroup[t.groupId]) gid = t.groupId;
    }
    if (!gid) { note('no block maps to a live task'); return; }
    var g = byGroup[gid];
    var before = g.color;
    note('group "' + g.name + '" colour was ' + before + ' owns ' +
      blocks.filter(function (b) { var t = byId[b.dataset.todo]; return t && t.groupId === gid; }).length +
      ' of ' + blocks.length + ' blocks');
    return API.op({ type: 'group:update', id: g.id, patch: { color: 'cream' } })
      .then(function () { return wait(500); })
      .then(function () { return API.op({ type: 'settings:update', patch: { theme: 'paper' } }); })
      .then(function () { return wait(500); })
      .then(function () { return measure('day/cream-group'); })
      .then(function () { return API.op({ type: 'settings:update', patch: { theme: 'ink' } }); })
      .then(function () { return wait(500); })
      .then(function () { return measure('night/cream-group'); })
      .then(function () { return API.op({ type: 'settings:update', patch: { theme: 'paper' } }); })
      .then(function () { return API.op({ type: 'group:update', id: g.id, patch: { color: before } }); })
      .then(function () { return API.getState(); })
      .then(function (st2) {
        var now = st2.groups.filter(function (x) { return x.id === g.id; })[0].color;
        note('restored colour=' + now + (now === before ? '' : '  <<<NOT RESTORED, was ' + before));
      });
  });
})();
