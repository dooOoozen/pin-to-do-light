/* The caption question, watched from inside the layer.
   The Rust guard can only ever sample the handle this process kept, and the JS side only ever
   sees its own client area — so for three rounds the two have been describing different
   windows. This polls the host's window report at 4 Hz and prints every change together with
   what the renderer believes about its own height at that moment, which is the same fact seen
   from the two ends of the wire: a caption stealing 31 px shows up in BOTH numbers, and a bar
   that shows up in neither belongs to a window nobody has looked at yet.
   Run it on the second monitor and do the gesture by hand: spread the cards, then click into
   an app on the first screen, then back. */
(function () {
  var API = window.API;
  var last = '', lastEv = '', n = 0, changed = 0, strips = 0, mode = '';
  function note(s) { try { API.bootNote('[W] ' + s); } catch (e) { /* no bridge */ } }
  function one(s) { return String(s || '').replace(/\s+/g, ' ').slice(0, 460); }

  setTimeout(function () {
    var deck = document.querySelector('#deckFace');
    if (deck) deck.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    note('start mode=' + document.body.dataset.mode + ' innerH=' + window.innerHeight);
    var t = setInterval(function () {
      n++;
      Promise.all([Promise.resolve(API.frameReport()), Promise.resolve(API.frameEvents())])
        .then(function (res) {
          var r = one(res[0]), ev = one(res[1]);
          var m = document.body.dataset.mode;
          var h = window.innerHeight;
          /* the foreground belongs in the line but not in the comparison: it changes every
             time the user clicks anything, and a sampler that reports it as a change spends
             its whole signal budget on "someone clicked elsewhere" */
          var mine = r.split(' | fg ')[0];
          if (ev !== lastEv) {
            strips++;
            note('t=' + (n * 250) + 'ms HOOK-EVENT innerH=' + h + ' :: ' + ev);
            lastEv = ev;
          }
          if (m !== mode) { mode = m; note('t=' + (n * 250) + 'ms mode=' + m + ' innerH=' + h); }
          var sig = mine + '|' + m + '|' + h;
          if (sig !== last) {
            changed++;
            note('t=' + (n * 250) + 'ms CHANGED innerH=' + h + ' mode=' + m + ' :: ' + mine);
            last = sig;
          }
          if (n % 40 === 0) note('beat samples=' + n + ' changed=' + changed + ' hookEvents=' + strips + ' innerH=' + h);
        }, function (e) { note('ERR ' + String((e && e.message) || e).slice(0, 120)); });
    }, 250);
    setTimeout(function () {
      clearInterval(t);
      note('done samples=' + n + ' changed=' + changed + ' hookEvents=' + strips);
    }, 150000);
  }, 1600);
})();
