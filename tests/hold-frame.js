/* The panel half of the gallery capture: get onto 仪表盘, the frame every material image in
   the README uses, and keep reporting the window rect and the body colour so the two
   photographs can be matched to what was actually on screen when they were taken.

   Its own file because the same script on both pages has to know which page it is on, and
   neither `location.pathname` (not final when the channel injects) nor the DOM (not parsed
   yet) answers that reliably. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  var tries = 0;
  function toDash() {
    var b = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
      .filter(function (x) { return (x.textContent || '').indexOf('仪表盘') >= 0; })[0];
    if (!b) {
      if (++tries < 30) return setTimeout(toDash, 250);
      note('panel nav never appeared'); return;
    }
    note('panel dash click=true');
    b.click();
    setInterval(function () {
      var d = window.devicePixelRatio || 1;
      note('panel rect=' + Math.round(window.screenX * d) + ',' + Math.round(window.screenY * d) +
        ' ' + Math.round(window.outerWidth * d) + 'x' + Math.round(window.outerHeight * d) +
        ' body=' + getComputedStyle(document.body).backgroundColor +
        ' style=' + document.documentElement.dataset.style +
        ' theme=' + document.documentElement.dataset.theme);
    }, 1000);
  }
  toDash();
})();
