/* The gesture the user reports: hover the deck and it spreads — click to scatter, click to
   recall, the deck files itself into the edge, then come back and stop on it. The second
   visit never spreads again.
   recall() disarms the hover so the deck does not bounce straight back under the pointer that
   pressed it. The re-arm condition was "the pointer is away from the deck right now AND the
   600 ms grace has passed". Those two cannot both become true on a return: the frames that
   carry a pointer back onto the deck are by definition near it, and while the deck is filed
   the only test running is the 14 px wake band, whose away branch is the sole place the hover
   used to be re-armed. A departure shorter than the grace therefore left the hover disarmed
   for the rest of the visit — the pill slid out, the cards stayed folded.
   The fix records the departure as a latch (hoverLeft) instead of inferring it from the
   position at the moment the grace expires.

   Five phases, each starting from a deck that is provably collapsed:
     A arrival from cold                — must spread
     B arrival after a real recall      — must spread
     C disarmed while on the deck, then clearly left, then back — must spread
     D left, then disarmed, then back   — must NOT spread (the recall guard still guards)
     E recall, off and straight back    — must spread (the reported bug; delete the latch and
       this is the phase that fails)

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
  function info() {
    var h = nd.hoverInfo();
    return 'mode=' + h.mode + ' tucked=' + h.tucked + ' armed=' + h.armed + ' left=' + h.left;
  }
  /* while filed, most of the dock hangs past the window edge; the visible sliver is the only
     part a pointer can occupy. Park near the SCREEN edge rather than at its middle: that is
     where a hand actually lands on a filed deck, and it is the position the settled box used
     to exclude — the midpoint passed by 2 px and proved nothing. */
  function arrival() {
    var r = nd.dockRect();
    var visL = Math.max(r.left, 0), visR = Math.min(r.right, window.innerWidth);
    var x = visR - visL >= 8 ? visL + (visR - visL) * 0.2 : r.left + r.width / 2;
    return { x: x, y: (r.top + r.bottom) / 2 };
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

  /* E: press 收回, move off, come straight back. The departure lands inside the 600 ms grace,
     so the position test alone cannot carry it: only the recorded departure can. The pointer
     keeps moving by a pixel, as a hand does, so the layer keeps getting frames to decide on. */
  function phaseE() {
    nd.tuck(false);
    nd.disarm();
    nd.cursorFrame(60, 900, false);
    return wait(160).then(function () {
      var p = arrival();
      var t0 = Date.now(), n = 0;
      note('E out-and-back arriving | ' + info() + ' graceIn=' + nd.hoverInfo().rearmIn);
      return new Promise(function (res2) {
        var iv = setInterval(function () {
          nd.cursorFrame(p.x + (n % 2), p.y, true);
          n++;
          if (nd.mode() === 'overview') {
            clearInterval(iv);
            note('E spread in ' + (Date.now() - t0) + 'ms → ok | ' + info());
            res2(true);
          } else if (Date.now() - t0 > 2400) {
            clearInterval(iv);
            note('E still in ' + (Date.now() - t0) + 'ms → WRONG | ' + info());
            res2(false);
          }
        }, 110);
      });
    });
  }

  var res = {}, seed = null;
  /* Switch off the host's pointer feed for the whole run. The user's own mouse on another
     display is mapped into this window's coordinates as a negative x, and its frames arrive
     between the injected ones and overwrite lastPointer and nearWas. Test frames are marked
     synthetic and bypass the switch, so this only silences the real pointer. */
  nd.cursorFeed(false);
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
    .then(function (ok) { res.D = ok; return phaseE(); })
    .then(function (ok) {
      res.E = ok;
      var bad = ['A', 'B', 'C', 'D', 'E'].filter(function (k) { return !res[k]; });
      note('RESULT ' + (bad.length === 0
        ? 'PASS spreads cold, after a recall (' + res.recallArmed + ' armed at recall), after any ' +
          'departure re-arms it, spreads a quick out-and-back, and still refuses a pointer that never left'
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
