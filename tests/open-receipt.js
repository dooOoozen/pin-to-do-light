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
        setTimeout(function () {
          var c = document.querySelector('.rcp-paper');
          var slot = document.querySelector('.rcp-slot');
          note(c ? 'paper=' + c.width + 'x' + c.height + ' css=' +
            Math.round(c.getBoundingClientRect().width) + 'x' + Math.round(c.getBoundingClientRect().height) +
            ' slot=' + Math.round(slot.getBoundingClientRect().height) +
            ' transform=' + c.style.transform : 'NO PAPER');
        }, 2600);
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
