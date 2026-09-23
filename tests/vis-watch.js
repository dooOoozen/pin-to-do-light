/* Who is in front, and does the deck step aside for them?
   The visibility policy has three reasons to take the layer off screen, and from the
   desktop they all look like "it vanished". This samples what the renderer actually
   decided and why, once a second, while something else (a real window, or the shell)
   holds the foreground — the host's own frame now carries the class and process of the
   window it saw, so the line names the offender instead of just the category.

   Run it on the display that does NOT hold the fullscreen window: a film on the other
   screen must leave the deck alone, which is the whole content of the `over` term in the
   host's fullscreen test. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[V] ' + s); } catch (e) { /* no bridge */ } }
  var t0 = Date.now(), n = 0, flips = [];
  var last = null;
  setInterval(function () {
    var v = nd.vis();
    var line = 'shown=' + v.shown + ' by=' + (v.by || '-') + ' fg=' + v.kind +
      ' over=' + v.over + ' full=' + v.full + ' who=' + (v.who || '-');
    if (last !== null && last !== v.shown) flips.push('+' + Math.round((Date.now() - t0) / 100) / 10 + 's ' + line);
    last = v.shown;
    n++;
    if (n % 3 === 1) {
      var d = nd.dockRect();
      note('t+' + Math.round((Date.now() - t0) / 1000) + 's ' + line +
        ' dock=' + (d ? Math.round(d.left) + ',' + Math.round(d.top) : 'none') +
        ' mode=' + nd.mode() + ' ' + nd.region());
    }
    if (n >= 16) {
      note('samples=' + n + ' flips=' + flips.length);
      flips.forEach(function (f) { note('flip ' + f); });
    }
  }, 1000);
})();
