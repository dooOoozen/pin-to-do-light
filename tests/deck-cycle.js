/* The deck has to do its whole life cycle on its own: pop when the pointer comes,
   collapse when it leaves, tuck into the edge when left alone. Every step of that runs
   through updateHover, which is exactly where a thrown ReferenceError used to kill the
   layer silently — so the assertions are on the state, and the harness greps the log for
   uncaught errors alongside them.

   It seeds a card when the active group is empty. Without that, a board with nothing on it
   reports "nothing popped out" — which reads like the bug being hunted and is really just an
   empty deck, and an empty deck is the normal state of this app while it is being tested. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[C] ' + s); } catch (e) { /* no bridge */ } }
  var dock = document.getElementById('dock');
  var seed = null, opened = false;
  function at() { return nd.mode() + '/tucked=' + nd.hoverInfo().tucked + '/cards=' + loose().length; }
  function loose() {
    return Array.prototype.slice.call(document.querySelectorAll('.todo-card'))
      .filter(function (c) { return !c.classList.contains('docked') && c.offsetWidth; });
  }
  function feed(x, y, inside) { nd.cursorFrame(x, y, inside); }
  /* Filed, the dock is translated mostly past the window edge, so its centre is a pixel no
     pointer can occupy — parking there measured an arrival nobody can make. Aim at the part
     of the box that is actually on screen: that is what an approach looks like, and the
     point stays inside the box after the deck slides back. */
  function target() {
    var r = dock.getBoundingClientRect();
    var visL = Math.max(r.left, 0), visR = Math.min(r.right, window.innerWidth);
    var x = visR - visL >= 8 ? (visL + visR) / 2 : r.left + r.width / 2;
    return [x, (r.top + r.bottom) / 2];
  }

  function ensureCard() {
    return API.getState().then(function (st) {
      var gid = st.settings.activeGroupId;
      if (st.todos.some(function (t) { return t.groupId === gid && !t.done; })) return null;
      return API.op({ type: 'todo:add', title: 'ZZ 循环卡', groupId: gid, activate: false })
        .then(function (r) { seed = r && r.id; note('seeded ' + seed); });
    });
  }

  function sweep() {
    /* by title as well as by id: a run that was killed halfway leaves a seeded card behind,
       and the next run must not inherit it as if it were the user's */
    return API.getState().then(function (st) {
      var live = st.todos.filter(function (t) { return t.title === 'ZZ 循环卡'; }).map(function (t) { return t.id; });
      return Promise.all(live.map(function (id) {
        return API.op({ type: 'todo:delete', id: id }).catch(function () {});
      }));
    }).then(function () { return API.getState(); }).then(function (st) {
      var inBin = (st.trash || []).filter(function (x) { return x.todo.title === 'ZZ 循环卡'; });
      return Promise.all(inBin.map(function (x) {
        return API.op({ type: 'trash:purge', id: x.todo.id }).catch(function () {});
      })).then(function () { note('seed swept live+bin=' + (seed ? 1 : 0) + '+' + inBin.length); });
    }).catch(function (e) { note('seed sweep threw ' + (e && e.message)); });
  }

  /* The host's cursor feed is live during the test, and a real pointer sitting anywhere in the
     wake band leaves nearWas=true — which routes the arrival through armPop (guarded for 1.4 s
     after a tuck) instead of the immediate pop. That is not what this test is about, so the
     arrival is re-offered from a clear departure until the deck answers, up to four times. */
  function approach(tries, done) {
    var c = target();
    feed(c[0], c[1], false);
    setTimeout(function () {
      c = target();
      feed(c[0], c[1], true);
      setTimeout(function () {
        if (!nd.hoverInfo().tucked || tries <= 0) { done(); return; }
        note('approach refused, retrying (' + tries + ' left)');
        feed(20, 300, false);
        setTimeout(function () { approach(tries - 1, done); }, 700);
      }, 500);
    }, 120);
  }

  function run() {
    nd.autoTuck(true);
    feed(20, 300, false);
    setTimeout(function () {
      note('start ' + at() + ' of ' + document.querySelectorAll('.todo-card').length);
      approach(4, function () {
        note('after approach ' + at() + ' near=' + nd.hoverInfo().armed);
        hoverCard();
      });
    }, 200);
  }

  /* The seed arrives through the state push, so the card exists a frame or two after the op
     resolves. Starting before it paints measures a deck with nothing in it, which fails for a
     reason that has nothing to do with the life cycle under test. */
  function waitForCard(tries) {
    if (document.querySelectorAll('.todo-card').length) { run(); return; }
    if (tries <= 0) { note('RESULT FAIL no card ever arrived'); sweep(); return; }
    setTimeout(function () { waitForCard(tries - 1); }, 120);
  }

  setTimeout(function () { ensureCard().then(function () { waitForCard(25); }); }, 1200);

  function hoverCard() {
    var list = loose();
    if (!list.length) { note('FAIL nothing popped out'); away(); return; }
    opened = true;
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
          var end = at();
          note('after idle ' + end + ' dock=' + JSON.stringify(nd.dockRect()));
          /* the three states are the whole contract; without a verdict here a deck that only
             ever sat still looked like a passing run */
          note('RESULT ' + (opened && end.indexOf('tucked=true') >= 0
            ? 'PASS popped on arrival, collapsed on leave, filed itself away when left alone'
            : 'FAIL popped=' + opened + ' final=' + end));
          sweep();
        }, 400);
      }, 5200);
    }, 900);
  }
})();
