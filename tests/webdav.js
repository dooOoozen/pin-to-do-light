/* The 坚果云 backup path, short of actually uploading anything.

   What can be checked without the user's account: that the four new host commands are
   reachable at all, that the path guard refuses the shapes which would turn a folder name
   into a different request, that an unconfigured setup fails with a sentence rather than a
   stack, and that the setting survives the normaliser — including the case where a stored
   directory is blank and would otherwise build a URL of "/dav//".

   The real PUT is deliberately not attempted here: that would mean firing a request at
   someone else's service with credentials that are not ours, and a green run would prove
   nothing about the user's own account anyway. It gets verified by the user clicking
   立即备份 once.

   settings.webdav is snapshotted and put back at the end, pass or fail.

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/webdav.js */
(function () {
  var API = window.API;
  var fails = [], notes = [];
  var before = null, touched = false;
  function note(s) { try { API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function check(ok, label) { if (!ok) fails.push(label); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function settle() {
    if (!touched || before === null) return Promise.resolve();
    return API.op({ type: 'settings:update', patch: { webdav: before } }).catch(function () {});
  }

  function rejects(p, want, label) {
    return p.then(function (r) {
      fails.push(label + ' resolved instead of failing: ' + JSON.stringify(r));
      return null;
    }, function (e) {
      var msg = String((e && e.message) || e);
      check(msg.indexOf(want) >= 0, label + ' said ' + JSON.stringify(msg) + ', wanted it to mention ' + JSON.stringify(want));
      notes.push(label + '="' + msg.slice(0, 40) + '"');
    });
  }

  Promise.resolve()
    .then(function () { return API.getState(); })
    .then(function (st) {
      before = JSON.parse(JSON.stringify(st.settings.webdav || {}));
      touched = true;
      check(typeof st.settings.webdav === 'object', 'settings.webdav is not an object at all');
      check(st.settings.webdav.dir === 'pin-to-do-backup',
        'the default directory is ' + JSON.stringify(st.settings.webdav.dir));
      check(st.settings.webdav.auto === false, 'auto-backup should default off, is ' + st.settings.webdav.auto);
      return API.webdavHint();
    })
    /* the hint is the only thing the host will ever say about the stored secret */
    .then(function (h) {
      check(typeof h === 'string' && h.length > 0, 'webdavHint gave ' + JSON.stringify(h));
      notes.push('hint=' + h);
      var bare = h.indexOf('未配置') >= 0;
      var next = rejects(API.webdavBackup('', 'pin-to-do-backup', 'x.json'), '账号', 'empty-account');
      if (bare) {
        /* only safe to probe the missing-password path when nothing is stored — otherwise it
           would try a real upload with the user's own credential */
        next = next.then(function () {
          return rejects(API.webdavBackup('someone@example.com', 'pin-to-do-backup', 'x.json'),
            '应用密码', 'no-secret');
        });
      }
      return next.then(function () { return bare; });
    })
    .then(function (bare) {
      if (!bare) return null;
      return rejects(API.webdavBackup('someone@example.com', '../../etc', 'x.json'), '不合法', 'guard');
    })
    /* the normaliser, exercised directly: a blank stored directory must not reach the URL */
    .then(function () {
      var D = window.NeonData;
      check(!!D && !!D.normalize, 'NeonData.normalize is not reachable from the page');
      if (!D) return null;
      var base = D.defaultState();
      var dirty = JSON.parse(JSON.stringify(base));
      dirty.settings.webdav = { account: null, dir: '   ', auto: 'yes', lastDate: null };
      var out = D.normalize(dirty).settings.webdav;
      check(out.dir === 'pin-to-do-backup', 'a blank stored dir normalised to ' + JSON.stringify(out.dir));
      check(out.account === '', 'a null account normalised to ' + JSON.stringify(out.account));
      check(out.auto === false, "auto: 'yes' normalised to " + JSON.stringify(out.auto));
      check(out.lastDate === '', 'a null lastDate normalised to ' + JSON.stringify(out.lastDate));
      var ok = JSON.parse(JSON.stringify(base));
      ok.settings.webdav = { account: 'a@b.com', dir: ' 备份/每天 ', auto: true, lastDate: '2026-10-12' };
      var good = D.normalize(ok).settings.webdav;
      check(good.dir === '备份/每天', 'a real directory was mangled: ' + JSON.stringify(good.dir));
      check(good.auto === true && good.lastDate === '2026-10-12', 'a valid webdav setting was dropped');
      notes.push('normalise ok');
      return API.op({ type: 'settings:update', patch: { webdav: {
        account: 'probe@example.com', dir: 'probe-dir', auto: true, lastDate: ''
      } } });
    })
    .then(function () { return wait(400); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      var w = st.settings.webdav;
      check(w.account === 'probe@example.com' && w.dir === 'probe-dir' && w.auto === true,
        'the write did not land: ' + JSON.stringify(w));
      notes.push('roundtrip=' + w.dir + '/' + w.auto);
      document.getElementById('btnSettings').click();
      return wait(900);
    })
    .then(function () {
      ['wdAcct', 'wdDir', 'wdKey', 'wdHint', 'wdNow', 'wdAutoHost'].forEach(function (id) {
        check(!!document.getElementById(id), 'the settings panel has no #' + id);
      });
      check(document.querySelectorAll('#wdAutoHost .switch').length === 1,
        'the auto-backup switch was not appended');
      var acct = document.getElementById('wdAcct');
      check(acct && acct.value === 'probe@example.com',
        'the panel did not load the stored account: ' + JSON.stringify(acct && acct.value));
    })
    .catch(function (e) { fails.push('threw: ' + (e && e.message)); })
    .then(settle)
    .catch(function (e) { note('SETTLE THREW ' + (e && e.message)); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      check(JSON.stringify(st.settings.webdav) === JSON.stringify(before),
        'settings.webdav was not put back: ' + JSON.stringify(st.settings.webdav));
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS') + ' ' + notes.join(' | '));
    });
})();
