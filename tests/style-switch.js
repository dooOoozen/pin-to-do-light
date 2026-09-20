/* Switch the material from the settings dialog and report what actually landed on the
   document: the data-style attribute, the resolved tokens, and the geometry that style is
   supposed to change. Read-only apart from the setting it is testing. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[S] ' + s); } catch (e) { /* no bridge */ } }
  function q(s) { return document.querySelector(s); }
  function tok(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function probe(tag) {
    var hud = q('#modClock') || q('.hud');
    var btn = q('#btnSettings');
    var cs = getComputedStyle(hud);
    var bh = getComputedStyle(btn);
    note(tag + ' style=' + (document.documentElement.dataset.style || '-') +
      ' theme=' + (document.documentElement.dataset.theme || '-') +
      ' radius=' + cs.borderTopLeftRadius + ' edge=' + cs.borderTopColor +
      ' shadow=' + (cs.boxShadow === 'none' ? 'none' : 'yes') +
      ' grain=' + (cs.backgroundImage === 'none' ? 'none' : 'tex') +
      ' btnFont=' + bh.fontFamily.split(',')[0] +
      ' paper=' + tok('--paper') + ' ink=' + tok('--ink') + ' brick=' + tok('--brick'));
  }

  probe('boot   ');
  q('#btnSettings').click();
  setTimeout(function () {
    var cards = Array.prototype.slice.call(document.querySelectorAll('#styleRows .style-card'));
    note('picker cards=' + cards.length + ' names=' + cards.map(function (c) { return c.dataset.style; }).join(',') +
      ' on=' + (q('#styleRows .style-card.on') || { dataset: {} }).dataset.style +
      ' tag=' + (q('#styleNow') || { textContent: '-' }).textContent);
    var diner = cards.filter(function (c) { return c.dataset.style === 'diner'; })[0];
    if (!diner) { note('FAIL no diner card'); return; }
    diner.click();
    setTimeout(function () {
      probe('diner  ');
      API.getState().then(function (st) {
        note('saved style=' + st.settings.style + ' theme=' + st.settings.theme);
        /* back to the material the user left it on */
        var back = cards.filter(function (c) { return c.dataset.style === 'print'; })[0];
        back.click();
        setTimeout(function () {
          probe('restored');
          q('.modal-foot .btn') && q('.modal-foot .btn').click();
        }, 700);
      });
    }, 700);
  }, 900);
})();
