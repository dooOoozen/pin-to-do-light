/* A material owns both its surface texture and that texture's geometry, and the geometry
   has to reach every surface that paints it — the sidebar, the stat tiles, the module
   plates, the desk paper. Two real defects are what this checks for: a rule that sets
   background-size for its own decoration and thereby squashes the texture (the old
   .reticle declared eight size slots and no image, which left the module plates with an
   11x1 sliver of every material's surface), and a rule that switches the texture off for
   a surface the material still needs lit (the night build's "no grain on the big plates"
   left the garden ramp off the modules and the ledger).
   So surfaces are compared against the material's own resolved tokens rather than against
   a guess at what a gradient looks like, and every read waits for the style attribute to
   actually land: a fixed delay measured the previous material and reported it under the
   next material's name. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[T] ' + s); } catch (e) { /* no bridge */ } }

  var GRAINED = [
    ['side', '.side'], ['meter', '.side-meter'], ['mod', '.mod'],
    ['stat', '.stat'], ['ledger', '.list-wrap'], ['composer', '.composer']
  ];
  /* Night is a lit screen and paper grain belongs to daylight, so a material whose
     texture is grain is allowed to drop it from the big plates after dark. A material
     whose texture is the surface's own light is not. */
  var LIT = { garden: true };

  var probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:-9999px;width:10px;height:10px';
  document.documentElement.appendChild(probe);
  function resolved(prop, token) {
    probe.style[prop] = '';
    probe.style[prop] = 'var(' + token + ')';
    return getComputedStyle(probe)[prop];
  }
  function split(s) {
    var out = [], d = 0, cur = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '(') d++; else if (ch === ')') d--;
      if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.map(function (x) { return x.trim(); });
  }

  function report(style, hour) {
    var want = { img: resolved('backgroundImage', '--tex-grain'),
                 size: resolved('backgroundSize', '--tex-size'),
                 desk: resolved('backgroundSize', '--tex-size-bg') };
    var bad = [];
    note('[' + style + '/' + hour + '] token grain=' +
      (want.img === 'none' ? 'none' : want.img.replace(/\s+/g, '').slice(0, 26)) +
      ' size=' + want.size + ' desk=' + want.desk);
    if (want.img === 'none') { note('[' + style + '/' + hour + '] paints no surface, skipped'); return; }
    var pairs = GRAINED.map(function (p) { return [p[0], p[1], want.size]; })
      .concat([['desk', '.paper-grid', want.desk]]);
    pairs.forEach(function (p) {
      var el = document.querySelector(p[1]);
      if (!el) { bad.push(p[0] + ':missing'); return; }
      var cs = getComputedStyle(el);
      var img = split(cs.backgroundImage);
      var size = split(cs.backgroundSize);
      var n = img.length;
      var grain = img[n - 1] || 'none';
      var sz = (size.length === 1 ? size[0] : size[Math.min(n, size.length) - 1] || 'auto');
      var why = '';
      if (grain === 'none') {
        if (LIT[style] || hour === 'paper') why = 'CLOBBERED-image';
      } else if (sz.replace(/\s+/g, '') !== p[2].replace(/\s+/g, '')) {
        why = 'CLOBBERED-size(' + sz + ')';
      }
      if (why) bad.push(p[0] + ':' + why);
      note('[' + style + '/' + hour + '] ' + p[0] + ' grain=' +
        (grain.indexOf('url') === 0 ? 'tile' : grain.replace(/\s+/g, '').slice(0, 22)) +
        ' size=' + sz + (why ? '  <<<' + why : ''));
    });
    note('[' + style + '/' + hour + '] ' + (bad.length ? 'BAND ' + bad.join(' ') : 'continuous'));
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  /* the attribute is what theme-apply writes when the state lands, so it is the only
     honest signal that the numbers being read belong to the material being asked about */
  function settled(style, hour) {
    var d = document.documentElement.dataset;
    return d.style === style && d.theme === (hour === 'ink' ? 'ink' : 'paper');
  }
  function visit(style, hour) {
    return API.op({ type: 'settings:update', patch: { style: style, theme: hour } })
      .then(function () { return wait(120); })
      .then(function tick() {
        return settled(style, hour) ? null : wait(140).then(tick);
      })
      .then(function () { return wait(220); })
      .then(function () { report(style, hour); });
  }

  setTimeout(function () {
    var chain = Promise.resolve();
    [['print', 'paper'], ['print', 'ink'], ['garden', 'paper'], ['garden', 'ink'],
     ['p3', 'paper'], ['p3', 'ink'], ['ikb', 'paper'], ['unp', 'paper'], ['diner', 'paper']]
      .forEach(function (pair) {
        chain = chain.then(function () { return visit(pair[0], pair[1]); });
      });
    chain.then(function () { return visit('print', 'paper'); })
      .then(function () { note('restored print/paper'); });
  }, 900);
})();
