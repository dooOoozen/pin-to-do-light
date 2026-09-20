/* Reproduces the deck's ▤ exactly as the user presses it: a real DOM click on the
   toolbar button, which goes through invoke('toggle_dashboard') on a command worker
   thread. --panel is not the same thing: it opens the panel from a thread we spawn
   ourselves, and the difference is what this is here to expose. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote(s); } catch (e) { /* no bridge */ } }
  var btn = document.getElementById('toolDashboard');
  var info = function () {
    var h = nd.hoverInfo();
    return 'mode=' + h.mode + ' tucked=' + h.tucked + ' ' + nd.region() +
      ' bodyBg=' + getComputedStyle(document.body).backgroundColor +
      ' rootBg=' + getComputedStyle(document.documentElement).backgroundColor;
  };
  if (!btn) { note('[D] FAIL no #toolDashboard'); return; }
  note('[D] pre  ' + info());
  btn.click();
  setTimeout(function () { note('[D] +0.4 ' + info()); }, 400);
  setTimeout(function () { note('[D] +1.5 ' + info()); }, 1500);
  setTimeout(function () { note('[D] +4   ' + info()); }, 4000);
})();
