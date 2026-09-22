/* Opens the receipt the way the sidebar button does, so the printer can be screenshotted
   and the ejected paper measured from outside the page. */
(function () {
  function note(s) { try { window.API.bootNote('[R] ' + s); } catch (e) { /* no bridge */ } }
  function once(at) {
    setTimeout(function () {
      if (!window.Receipt) { note('Receipt missing'); return; }
      window.API.getState().then(function (st) {
        window.Receipt.open(st);
        note('opened at +' + at);
        /* the complaint being fixed: the machine used to walk upward as the paper fed,
           because the slot grew and the rig is centred. The machine must not move. */
        function where(at) {
          var m = document.querySelector('.rcp-machine');
          var c = document.querySelector('.rcp-paper');
          var a = document.querySelector('.rcp-actions') || document.querySelector('.rcp-side');
          if (!m) { note('NO MACHINE at ' + at); return; }
          var mr = m.getBoundingClientRect(), ar = a ? a.getBoundingClientRect() : null;
          note(at + ' machine=' + Math.round(mr.left) + ',' + Math.round(mr.top) +
            ' buttons=' + (ar ? Math.round(ar.left) + ',' + Math.round(ar.top) : '-') +
            ' paper=' + (c ? Math.round(c.getBoundingClientRect().top) : '-') +
            ' slotH=' + Math.round(document.querySelector('.rcp-slot').getBoundingClientRect().height));
        }
        where('t0');
        setTimeout(function () { where('t1200'); }, 1200);
        setTimeout(function () {
          where('t2800');
          var c = document.querySelector('.rcp-paper');
          note(c ? 'final paper=' + c.width + 'x' + c.height + ' transform=' + c.style.transform : 'NO PAPER');
        }, 2800);
      });
    }, at);
  }
  /* Keep re-printing every seven seconds: the recorder takes a few seconds to start and
     the panel is not even created until the host opens it, so a single scheduled eject is
     a coin flip. The loop is what makes the capture repeatable. */
  setTimeout(function () {
    once(0);
    setInterval(function () { once(0); }, 7000);
  }, 1400);
})();
