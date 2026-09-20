/* Region assertions for the Tauri build, driven through --test-script.
   WebView2 gives this build no debugging port, so the script is injected by the
   host, talks to the page's own __nd surface, and reports through API.bootNote
   into %APPDATA%\dev.qoder.pintauri\boot.log.

   Run:  pin-tauri.exe --test-script tests/region-check.js
   Read: the [T] lines. Expect on every line — region=ok/ok, sliver=OURS, far=THROUGH
   and, once the pads have settled, want == pushed. */
(function () {
  var API = window.API, nd = window.__nd, doc = document;
  function note(s) { try { API.bootNote(s); } catch (e) { /* no bridge: nothing to say to */ } }
  var dock = doc.getElementById('dock');

  /* a point the tucked sliver definitely draws into */
  function sliverPoint() {
    var d = dock.getBoundingClientRect();
    var w = window.innerWidth;
    return {
      x: d.left < 0 ? 6 : (d.right > w ? w - 6 : Math.round(d.left + d.width / 2)),
      y: Math.round(d.top + d.height / 2)
    };
  }

  function say(tag) {
    var p = sliverPoint();
    var far = { x: Math.round(window.innerWidth * 0.62), y: 24 };
    var owns = function (q) { return nd.swallowsAt(q.x, q.y) ? 'OURS' : 'THROUGH'; };
    note('[T] ' + tag + ' tucked=' + nd.hoverInfo().tucked + ' ' + nd.region() +
      ' sliver@' + p.x + ',' + p.y + '=' + owns(p) +
      ' far@' + far.x + ',' + far.y + '=' + owns(far));
  }

  if (!dock) { note('[T] FAIL no #dock'); return; }
  setTimeout(function () {
    say('A-rest');
    nd.tuck(true);
    /* right after the tuck the wide animation pads are still owed to us */
    setTimeout(function () { say('B-tucked-hot'); }, 500);
    setTimeout(function () {
      say('C-tucked-settled');
      nd.tuck(false);
      setTimeout(function () { say('D-rest-back'); }, 1600);
    }, 1600);
  }, 200);
})();
