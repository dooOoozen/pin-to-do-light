/* Simplified cards hand the whole sheet to the title, centred in the whole card.
   Measured per card, in the scatter, with the real geometry the region sees:
     - a task with notes: the title + notes group has to be centred
     - a task without notes: the title alone has to be centred — this is the case that fell
       to the bottom-left, because the auto margins it was built on lost their lower half
       when paintCard hid the notes row
   `simple` is switched on through the same class the setting drives, so nothing is written
   to the store, and the scatter is toggled with the app's own 'd' shortcut. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[S] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var root = document.documentElement;
  var fails = [];
  function check(name, ok, detail) {
    note((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ' · ' + detail : ''));
    if (!ok) fails.push(name);
  }
  function centre(a, b) { return (a + b) / 2; }
  var measured = 0;
  function measure(c, i, tag, quiet) {
    var cr = c.getBoundingClientRect();
    var t = c.querySelector('.card-title').getBoundingClientRect();
    var nEl = c.querySelector('.card-notes');
    var hasNotes = nEl && getComputedStyle(nEl).display !== 'none' && nEl.textContent;
    /* the whole card is the centring box: the tack is drawn at the top of the paper but is
       out of the flow in this mode, so it must not shift what the person reads as "middle" */
    var lo = cr.top, hi = cr.bottom;
    var want = centre(lo, hi);
    var got = hasNotes ? centre(t.top, nEl.getBoundingClientRect().bottom) : centre(t.top, t.bottom);
    var off = Math.abs(got - want);
    var tol = (hi - lo) * 0.14;
    measured++;
    var line = tag + ' card' + i + ' ' + (hasNotes ? 'notes' : 'bare') +
      ' off=' + off.toFixed(1) + '/' + tol.toFixed(1) +
      ' card=' + Math.round(cr.top) + '..' + Math.round(cr.bottom) +
      ' title=' + Math.round(t.top) + '..' + Math.round(t.bottom);
    var ok = off <= tol;
    if (!ok && !quiet) {
      fails.push(tag + '-card' + i + '-' + (hasNotes ? 'notes' : 'bare'));
      note('FAIL ' + line + ' "' + (c.querySelector('.card-title').textContent || '').slice(0, 12) + '"');
    } else if (!quiet) {
      note('ok   ' + line);
    } else {
      note('     ' + line + '  (control, expected to be off-centre)');
    }
    return ok;
  }

  /* wait(), not setTimeout(): the latter hands back a timer id, so a `.then` chained onto it
     throws before the test has said a word — and because the callback is already scheduled,
     the half of the test that changes the page still runs while the half that measures it
     never exists. That is how this file deployed the scatter and then reported nothing. */
  wait(700).then(function () {
    document.body.classList.add('simple');
    if (document.body.dataset.mode !== 'deployed') {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    }
    return wait(1200);
  }).then(function () {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.todo-card'))
      .filter(function (c) { return !c.classList.contains('docked') && c.offsetWidth; });
    note('mode=' + document.body.dataset.mode + ' simple=' + document.body.classList.contains('simple') +
      ' cards=' + cards.length);
    /* the reported case is the bare one, so it has to be present in the data for this run to
       mean anything; the notes case is exercised by hand below rather than left to chance */
    check('the scatter has cards to measure', cards.length > 0, 'cards=' + cards.length);
    cards.forEach(function (c, i) { measure(c, i, 'data'); });
    var first = cards[0];
    if (first) {
      var n = first.querySelector('.card-notes');
      n.textContent = '一行备注，用来测有备注的那条路径';
      n.style.display = '';
      measure(first, 0, 'forced-notes');
      n.textContent = '';
      n.style.display = 'none';
    }
    /* the control: the same card, measured with the centring switched off by hand. A test
       that cannot fail is not a test — this one was green for the whole time the titles were
       sitting in the bottom-left corner, because it had never been shown a card that was in
       the wrong place. */
    var probe = cards[0];
    if (probe) {
      var pb = probe.querySelector('.card-body');
      var was = pb.style.justifyContent;
      pb.style.justifyContent = 'flex-end';
      var off = measure(probe, 0, 'control-no-centring', true);
      pb.style.justifyContent = was;
      check('the control measures off-centre when the centring is switched off', off === false,
        'expected the title to fall to the bottom of the card');
    }
    check('every title sits in the middle of the whole card', !fails.length,
      fails.length ? fails.join(',') : 'measured ' + measured);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    return wait(600);
  }).then(function () {
    document.body.classList.remove('simple');
    note('RESULT ' + (fails.length ? 'FAIL ' + fails.length : 'PASS'));
  }).catch(function (e) {
    note('RESULT ERROR ' + (e && e.message));
  });
})();
