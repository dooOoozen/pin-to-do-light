/* The gesture the user reports: hover the deck and it spreads — click to scatter, click to
   recall, the deck files itself into the edge, then come back and stop on it. The second
   visit never spreads again.
   It is not a timing bug. recall() disarms the hover so the deck does not bounce straight
   back under a pointer that is still sitting on it, and the only re-arm lives inside
   updateHover — which is never called while the deck is filed away, because the tucked
   branch of the cursor feed handles those frames and only checks the wake band. So once a
   recall is followed by a tuck, nothing can ever re-arm it: the deck pops forever and never
   spreads again.

   Four phases, each starting from a deck that is provably collapsed AND filed:
     A arrival from cold                — must spread
     B arrival after a real recall      — must spread (the reported bug)
     C disarmed while on the deck, then clearly left, then back — must spread (proves the
       departure is what carries B; delete the re-arm and this is the phase that fails)
     D left, then disarmed, then back   — must NOT spread (the recall guard still guards)

   Frames go through nd.cursorFrame, the real command branch; cursorCmd skips the tucked path
   entirely and would have passed this. Scatter/recall use nd.deploy, the deck's own handler.
   The active group can legitimately be empty, and an empty deck cannot be deployed at all —
   which is how one version of this probe "passed" without ever scattering — so it seeds a
   card and takes it back out.

   Run on the second display:
     pin-tauri.exe --monitor 2 --test-script tests/rehover.js */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[R] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function info() { var h = nd.hoverInfo(); return 'mode=' + h.mode + ' tucked=' + h.tucked + ' armed=' + h.armed; }
  /* while filed, most of the dock hangs past the window edge; the visible sliver is the only
     part a pointer can occupy, and it stays inside the box after the pop */
  function arrival() {
    var r = nd.dockRect();
    var visL = Math.max(r.left, 0), visR = Math.min(r.right, window.innerWidth);
    return { x: visR - visL >= 8 ? (visL + visR) / 2 : r.left + r.width / 2, y: (r.top + r.bottom) / 2 };
  }

  /* park the pointer far away until the deck has retracted and filed itself */
  function settle(label) {
    nd.cursorFrame(60, 900, false);
    return wait(1800).then(function () {
      nd.cursorFrame(60, 900, false);
      return wait(400);
    }).then(function () {
      var h = nd.hoverInfo();
      if (h.mode !== 'collapsed' || !h.tucked) note(label + ' NOT at rest: ' + info());
      return h;
    });
  }

  /* arrive and stop; want=false asserts that it must not spread. skipSettle is for the phase
     that has just been disarmed by hand — parking again would re-arm it, which is the very
     thing the other phase proves. */
  function arrive(label, want, skipSettle) {
    return (skipSettle ? wait(60) : settle(label)).then(function () {
      note(label + ' arriving | ' + info());
      var p = arrival();
      nd.cursorFrame(p.x, p.y, true);
      var t0 = Date.now();
      return new Promise(function (res) {
        var iv = setInterval(function () {
          if (nd.mode() === 'overview') { clearInterval(iv); res('spread'); }
          else if (Date.now() - t0 > 2000) { clearInterval(iv); res('still'); }
        }, 30);
      }).then(function (r) {
        var ok = want === false ? r === 'still' : r === 'spread';
        note(label + ' ' + r + ' in ' + (Date.now() - t0) + 'ms want=' + (want === false ? 'still' : 'spread') +
          ' → ' + (ok ? 'ok' : 'WRONG') + ' | ' + info());
        return ok;
      });
    });
  }

  var res = {}, seed = null;
  Promise.resolve().then(function () { return wait(2400); })
    .then(function () { return API.getState(); })
    .then(function (st) {
      /* a deck with nothing in it cannot scatter, so make sure there is something */
      var gid = st.settings.activeGroupId;
      if (!st.todos.some(function (t) { return t.groupId === gid && !t.done; })) {
        return API.op({ type: 'todo:add', title: 'ZZ 再悬停甲', groupId: gid }).then(function () {
          return API.getState();
        }).then(function (s2) {
          seed = (s2.todos.filter(function (t) { return t.groupId === gid && !t.done; })
            .sort(function (a, b) { return b.createdAt < a.createdAt ? -1 : 1; })[0] || {}).id;
          note('seeded ' + seed);
        });
      }
      return null;
    })
    .then(function () { nd.autoTuck(true); return arrive('A cold arrival'); })
    .then(function (ok) {
      res.A = ok;
      var was = nd.mode();
      var s = nd.deploy();
      note('scatter → ' + s + ' (from ' + was + ')');
      if (s !== 'deployed') { res.B = false; note('B WRONG could not deploy'); return null; }
      var r = nd.deploy();
      note('recall → ' + r + ' | ' + info());
      res.recallArmed = nd.hoverInfo().armed;
      return arrive('B after recall+tuck');
    })
    .then(function (ok) { if (res.B === undefined) res.B = ok; return wait(300); })
    /* disarmed with the pointer still on the deck, filed away, then a clear departure, then
       back — the re-arm must come from the tucked branch, because that is the whole bug */
    .then(function () { nd.disarm(); nd.tuck(true); return arrive('C disarmed→left→back'); })
    .then(function (ok) { res.C = ok; return settle('D'); })
    /* the departure re-armed it; disarm again now that the pointer is away, so the arrival
       that follows has not clearly left — the guard must hold */
    .then(function () { nd.disarm(); return arrive('D disarmed, never left', false, true); })
    .then(function (ok) {
      res.D = ok;
      var bad = ['A', 'B', 'C', 'D'].filter(function (k) { return !res[k]; });
      note('RESULT ' + (bad.length === 0
        ? 'PASS spreads cold, after a recall (' + res.recallArmed + ' armed at recall), and after any ' +
          'departure re-arms it; still refuses a pointer that never left'
        : 'FAIL ' + bad.map(function (k) { return k + '=' + res[k]; }).join(' ')));
    })
    .then(function () {
      if (!seed) return null;
      return API.op({ type: 'todo:delete', id: seed }).then(function () { return API.getState(); })
        .then(function (st) {
          return Promise.all((st.trash || []).filter(function (x) {
            return x.todo.title === 'ZZ 再悬停甲';
          }).map(function (x) { return API.op({ type: 'trash:purge', id: x.todo.id }); }));
        }).then(function () { note('cleanup seed removed'); });
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
