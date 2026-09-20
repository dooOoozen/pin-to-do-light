(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[K] ' + s); } catch (e) { /* no bridge */ } }
  function txt(sel) { var n = document.querySelector(sel); return n ? n.textContent.replace(/\s+/g, ' ').trim() : '-'; }
  function vis(sel) { var n = document.querySelector(sel); return n ? (getComputedStyle(n).display === 'none' ? 'hidden' : 'SHOWN') : 'missing'; }
  /* the script is injected as soon as the window exists, which can be before the
     page has built its sidebar — wait for the nav rather than reporting a false failure */
  var tries = 0;
  (function waitForNav() {
    var nav = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'));
    var t = nav.filter(function (x) { return x.textContent.indexOf('时间轴') >= 0; })[0];
    if (!t) {
      if (++tries > 40) { note('FAIL no tracking nav after ' + tries + ' tries; nav=' + nav.length); return; }
      return setTimeout(waitForNav, 250);
    }
    note('nav=' + nav.map(function (x) { return x.textContent.replace(/[0-9]+$/, ''); }).join(','));
    t.click();
  setTimeout(function () {
    note('view form=' + vis('#pageTasks .composer') + ' band=' + document.querySelectorAll('.tk-band').length +
      ' ticks=' + document.querySelectorAll('.tk-tick').length + ' runs=' + document.querySelectorAll('.tk-run').length +
      ' dur=' + txt('#tkDur') + ' btn=' + txt('.tk-now .btn') + ' pick=' + document.querySelectorAll('#tkPick option').length);
    var b = document.querySelector('.tk-now .btn');
    if (b) b.click();
    setTimeout(function () {
      note('started open=' + document.querySelectorAll('.tk-run.open').length + ' dur=' + txt('#tkDur') + ' sum=' + txt('.tk-sum'));
      setTimeout(function () {
        note('t+2.2s dur=' + txt('#tkDur') + ' bandW=' + (document.querySelector('.tk-run.open') || { style: {} }).style.width);
        var s = document.querySelector('.tk-now .btn');
        if (s) s.click();
        setTimeout(function () {
          note('stopped dur=' + txt('#tkDur') + ' rows=' + document.querySelectorAll('.tk-task-row').length +
            ' entries=' + document.querySelectorAll('.tk-entry').length + ' sum=' + txt('.tk-sum'));
        }, 1200);
      }, 2200);
    }, 900);
  }, 700);
  })();
})();
