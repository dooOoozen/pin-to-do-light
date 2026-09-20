/* Opens the settings modal and drives the first picker in the lab: live preview on
   input, persistence on change, and what actually landed in the store. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[L] ' + s); } catch (e) { /* no bridge */ } }
  document.getElementById('btnSettings').click();
  setTimeout(function () {
    var rows = document.querySelectorAll('#palRows .pal-row');
    note('theme=' + document.documentElement.dataset.theme +
      ' panel=' + (document.getElementById('panelPalette') ? 'present' : 'MISSING') +
      ' rows=' + rows.length);
    if (!rows.length) return;
    var sw = rows[0].querySelector('input[type=color]');
    note('first=' + rows[0].querySelector('.pal-name').textContent +
      ' value=' + sw.value + ' bodyBg=' + getComputedStyle(document.body).backgroundColor);
    sw.value = '#3a5f6e';
    sw.dispatchEvent(new Event('input', { bubbles: true }));
    note('live paper=' + getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() +
      ' rule=' + getComputedStyle(document.documentElement).getPropertyValue('--rule').trim());
    sw.dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(function () {
      API.getState().then(function (st) {
        note('saved=' + JSON.stringify(st.settings.palette) + ' theme=' + st.settings.theme);
      });
    }, 700);
  }, 800);
})();
