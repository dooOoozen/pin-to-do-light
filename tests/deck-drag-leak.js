/* A fast deck drag — 120 px every 40 ms, about 3000 px/s, so the dock moves ~450 px
   between two throttled region refreshes and is far outside the animation pad. That is
   the condition a real drag reaches and the earlier slow test never did. The assertion
   is nd.lag(): is everything being painted inside the region the OS was actually told
   about — not inside the geometry the code would like. */
(function () {
  var nd = window.__nd, API = window.API;
  function note(s) { try { API.bootNote('[G] ' + s); } catch (e) { /* no bridge */ } }
  var face = document.getElementById('deckFace');
  var dock = document.getElementById('dock');
  if (!face) { note('FAIL no #deckFace'); return; }
  nd.autoTuck(false);
  nd.tuck(false);
  var r = face.getBoundingClientRect();
  var pid = 7;
  function ptr(type, x, y) {
    face.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: pid, isPrimary: true,
      button: 0, buttons: 1, clientX: x, clientY: y
    }));
  }
  setTimeout(function () {
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    ptr('pointerdown', x, y);
    /* park it near the top first, so the downward sweep below is real travel; a test
       that starts at the clamp "passes" without moving anything */
    ptr('pointermove', x, y - 600);
    ptr('mousemove', x, y - 600);
    var start = dock.getBoundingClientRect().top;
    var i = 0;
    var iv = setInterval(function () {
      i++;
      y += 120;
      ptr('pointermove', x, y);
      ptr('mousemove', x, y);
      var d = dock.getBoundingClientRect();
      /* keep a card hovered while the box moves, as it is when the user drags */
      nd.cursorCmd(d.left + d.width / 2, d.top + d.height / 2, true);
      var dd = dock.getBoundingClientRect();
      /* the trailing-card complaint: while the box is grabbed, cards must not be
         easing into position, so their transition has to read as off */
      var card = document.querySelector('.todo-card');
      var tsec = card ? getComputedStyle(card).transitionDuration : '?';
      note('step' + i + ' dock=' + Math.round(dd.left) + ',' + Math.round(dd.top) +
        ' travel=' + Math.round(dd.top - start) + ' cardTransition=' + tsec +
        ' ' + nd.region() + ' lag=' + nd.lag() + ' ALL=' + nd.leaks(1));
      if (i >= 6) {
        clearInterval(iv);
        var moved = Math.abs(dock.getBoundingClientRect().top - start);
        note(moved > 200 ? 'REAL TRAVEL ' + Math.round(moved) + 'px' : 'FAIL dock barely moved (' + Math.round(moved) + 'px)');
        ptr('pointerup', x, y);
        ptr('mouseup', x, y);
        setTimeout(function () { note('released ' + nd.region() + ' lag=' + nd.lag()); }, 600);
      }
    }, 40);
  }, 700);
})();
