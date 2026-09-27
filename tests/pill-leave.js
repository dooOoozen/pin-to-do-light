/* The live report was "静置状态下仍然是卡片堆" while every instrumented run said the pill was
   on. The difference is who drives the pointer: the harness parked the cursor at 20,20 and
   then asked for the untuck, which armed the capsule from the untuck hook. A person does the
   opposite — they walk up to the deck, look at it, and walk away — and the frame in which they
   walk away never reached the hover code at all. So this test is exactly that gesture, twice:
   approach, confirm the deck is full, leave, and the pill has to come back by itself.

   The real cursor feed is switched off first, so nothing but these frames moves the state. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[L] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function pill() { return document.body.classList.contains('deck-capsule'); }
  function centre() {
    var r = nd.dockRect();
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
  }
  function look(tag, want) {
    var got = pill();
    var line = tag + ' pill=' + (got ? 'ON' : 'off') + ' want=' + (want ? 'ON' : 'off') +
      ' mode=' + nd.mode() + ' deck=' + (function () {
        var r = nd.dockRect();
        return Math.round(r.right - r.left) + 'x' + Math.round(r.bottom - r.top);
      })();
    if (got !== want) bad.push(line);
    note(line);
  }
  var bad = [];
  nd.cursorFeed(false);
  Promise.resolve(API.setDeckMonitor(1)).catch(function () { /* single-screen machine */ })
    .then(function () { return wait(1400); })
    .then(function () { nd.autoTuck(false); nd.tuck(false); return wait(2200); })
    .then(function () { look('booted and left alone', true); })
    .then(function () {
      var c = centre();
      nd.cursorCmd(c.x, c.y, true);
      return wait(900);
    })
    .then(function () { look('pointer on the deck', false); })
    .then(function () { nd.cursorCmd(40, 40, true); return wait(2400); })
    .then(function () { look('pointer walked away', true); })
    .then(function () {
      var c = centre();
      nd.cursorCmd(c.x, c.y, true);
      return wait(900);
    })
    .then(function () { look('second approach', false); })
    .then(function () { nd.cursorCmd(40, 40, true); return wait(2400); })
    .then(function () {
      look('second departure', true);
      nd.cursorFeed(true);
      note('RESULT ' + (bad.length ? 'FAIL ' + bad.join(' | ') : 'PASS the pill returns on its own after a look'));
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
