/* Drives the host writer directly rather than by aiming a click at a button: the thing
   under test is where the file lands and what comes back, and a mis-aimed click tests
   nothing. */
(function () {
  function note(s) { try { window.API.bootNote('[S] ' + s); } catch (e) { /* no bridge */ } }
  setTimeout(function () {
    var c = document.createElement('canvas');
    c.width = 120; c.height = 60;
    var x = c.getContext('2d');
    x.fillStyle = '#f9efde'; x.fillRect(0, 0, 120, 60);
    x.fillStyle = '#14120d'; x.fillRect(8, 8, 40, 4);
    var url = c.toDataURL('image/png');
    note('dataUrl len=' + url.length + ' head=' + url.slice(0, 22));
    window.API.savePng(url, 'probe-中文 name.png').then(function (r) {
      note('saved path=' + (r && r.path) + ' dir=' + (r && r.dir));
      return window.API.openDir((r && r.dir) || '');
    }).then(function () { note('openDir ok'); })
      .catch(function (e) { note('FAILED ' + (e && e.message ? e.message : e)); });
  }, 1200);
})();
