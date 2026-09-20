/* Leaves the panel in the night palette so a crop can be taken. */
(function () {
  var b = document.getElementById('btnTheme');
  if (b && document.documentElement.dataset.theme !== 'ink') b.click();
})();
