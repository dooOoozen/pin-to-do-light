/* Puts the panel in the rounded material and opens 设置, then leaves it there: the four
   corners the user reported only appear in that combination, and a screenshot is the only
   way to see both the modal corners and the colour chips together. */
(function () {
  function note(s) { try { window.API.bootNote('[D] ' + s); } catch (e) { /* no bridge */ } }
  window.API.op({ type: 'settings:update', patch: { style: 'diner', theme: 'paper' } })
    .then(function () { return window.API.getState(); })
    .then(function (st) { note('holding ' + st.settings.style); })
    .catch(function (e) { note('FAILED ' + e); });
  setTimeout(function () {
    var b = document.querySelector('#btnSettings');
    if (b) { b.click(); note('settings opened'); } else note('no settings button');
  }, 4000);
})();
