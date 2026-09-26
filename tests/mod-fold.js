/* Folding has to survive three separate tests: the click, the layout that follows, and the
   settings write that has to come back through the reducer with the folded list intact. A
   fold that only changes the DOM would look perfect until the panel is reopened. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[D] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var m = document.getElementById('modClock');
  function state(tag) {
    var body = m.querySelector('.mod-body');
    var bb = body.getBoundingClientRect();
    var mb = m.getBoundingClientRect();
    note(tag + ' folded=' + m.classList.contains('folded') +
      ' module=' + Math.round(mb.width) + 'x' + Math.round(mb.height) +
      ' body=' + Math.round(bb.height) + ' gridRow=' + m.style.gridRow);
    return { folded: m.classList.contains('folded'), h: Math.round(mb.height), bh: Math.round(bb.height) };
  }
  var before, after;
  if (!m) { note('RESULT ERROR no #modClock'); return; }
  /* the panel opens on whatever view it was left on, and a hidden module measures 0x0 — the
     first run of this test "passed" its size assertions against a module nobody could see */
  function toDash() {
    var b = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
      .filter(function (x) { return (x.textContent || '').indexOf('仪表盘') >= 0; })[0];
    if (b) b.click();
    return !!b;
  }
  /* the dashboard is judged by the grid, not by the module under test: the previous run
     leaves the fold persisted, and a folded #modClock has no height by design — the test
     was waiting for a condition its own earlier pass had made impossible */
  function shown() {
    var g = document.getElementById('dashGrid');
    return g && g.getBoundingClientRect().height > 0;
  }
  function poll(k) {
    if (shown()) return k();
    if (poll.n++ > 24) { note('RESULT ERROR the dashboard never painted'); return; }
    setTimeout(function () { poll(k); }, 250);
  }
  toDash();
  var run = function () {
  /* the store may already hold a fold from an earlier run — the test is about the round trip,
     so it starts from unfolded whatever the last run left behind */
  var openFirst = m.classList.contains('folded');
  if (openFirst) { m.querySelector('.mod-fold').click(); }
  wait(openFirst ? 500 : 0).then(function () {
  state('start');
  m.querySelector('.mod-fold').click();
  return wait(400);
  }).then(function () {
    after = state('folded');
    return API.getState();
  }).then(function (st) {
    var c = (st.settings.dashLayout || {}).collapsed || [];
    note('persisted collapsed=' + JSON.stringify(c));
    if (c.indexOf('clock') < 0) throw new Error('the fold did not reach the store');
    if (after.h > 0) throw new Error('the module still occupies a grid cell (' + after.h + 'px)');
    var pill = document.querySelector('.folded-pill[data-mod="clock"]');
    if (!pill) throw new Error('no pill was left behind to undo it with');
    note('pill=' + pill.textContent.trim() + ' stripHidden=' + !!document.getElementById('dashFolded').hidden);
    m.querySelector('.mod-fold').click();
    return wait(400);
  }).then(function () {
    before = state('unfolded');
    if (!before || before.folded) throw new Error('did not come back');
    if (before.h < 100) throw new Error('came back at ' + before.h + 'px, not a real cell');
    if (document.querySelector('.folded-pill[data-mod="clock"]')) throw new Error('the pill survived the unfold');
    return API.getState();
  }).then(function (st) {
    var c = (st.settings.dashLayout || {}).collapsed || [];
    note('RESULT PASS folded, persisted, and unfolded clean (collapsed list now ' + JSON.stringify(c) + ')');
  }).catch(function (e) {
    note('RESULT FAIL ' + (e && e.message));
  });
  };
  /* and leave nothing behind if we abort midway */
  window.addEventListener('beforeunload', function () { try { m.classList.remove('folded'); } catch (e) {} });
  poll(run);
})();
