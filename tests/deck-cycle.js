/* The deck has to do its whole life cycle on its own: pop when the pointer comes,
   collapse when it leaves, tuck into the edge when left alone. Every step of that runs
   through updateHover, which is exactly where a thrown ReferenceError used to kill the
   layer silently — so the assertions are on the state, and the harness greps the log for
   uncaught errors alongside them. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[C] ' + s); } catch (e) { /* no bridge */ } }
  var dock = document.getElementById('dock');
  function at() { return nd.mode() + '/tucked=' + nd.hoverInfo().tucked + '/cards=' + loose().length; }
  function loose() {
    return Array.prototype.slice.call(document.querySelectorAll('.todo-card'))
      .filter(function (c) { return !c.classList.contains('docked') && c.offsetWidth; });
  }
  function feed(x, y, inside) { nd.cursorFrame(x, y, inside); }
  function centre() {
    var r = dock.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  setTimeout(function () {
    nd.autoTuck(true);
    var c = centre();
    feed(20, 300, false);
    setTimeout(function () {
      note('start ' + at());
      feed(c[0], c[1], false);
      setTimeout(function () {
        feed(c[0], c[1], true);
        setTimeout(function () {
          note('after approach ' + at() + ' near=' + nd.hoverInfo().armed);
          hoverCard();
        }, 500);
      }, 120);
    }, 200);
  }, 1200);

  function hoverCard() {
    var list = loose();
    if (!list.length) { note('FAIL nothing popped out'); away(); return; }
    var r = list[0].getBoundingClientRect();
    feed(r.left + r.width / 2, r.top + r.height / 2, true);
    setTimeout(function () {
      var grown = list[0].getBoundingClientRect();
      note('hover card ' + Math.round(r.width) + 'x' + Math.round(r.height) +
        ' -> ' + Math.round(grown.width) + 'x' + Math.round(grown.height) +
        ' region=' + nd.region() + ' leaks=' + nd.leaks(false));
      away();
    }, 700);
  }

  function away() {
    /* inside=true but far from the deck: that is what a pointer that has left the dock
       looks like to the layer. With inside=false the host says the pointer is not even
       over this window, and updateHover never runs. */
    feed(300, 900, true);
    setTimeout(function () {
      note('after leave ' + at());
      /* left alone on the desk: this is the auto-tuck that stopped firing */
      setTimeout(function () {
        feed(300, 900, true);
        setTimeout(function () {
          note('after idle ' + at() + ' dock=' + JSON.stringify(nd.dockRect()));
        }, 400);
      }, 5200);
    }, 900);
  }
})();
