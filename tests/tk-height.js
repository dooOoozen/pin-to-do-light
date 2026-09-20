/* Does the axis actually follow the window when it is resized? Logs the boxes, waits
   for the harness to resize the panel underneath it, then logs again — the resize
   listener has to do the work, not a re-render. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[Z] ' + s); } catch (e) { /* no bridge */ } }
  function q(s) { return document.querySelector(s); }
  function shot(tag) {
    var wrap = q('.tkx'), body = q('.tk-body'), side = q('.tk-side'), rec = q('.tk-recent');
    if (!wrap) return note(tag + ' NO tkx');
    var wr = wrap.getBoundingClientRect(), br = body.getBoundingClientRect();
    note(tag + ' vh=' + window.innerHeight + ' wrap=' + Math.round(wr.height) +
      ' bottom=' + Math.round(wr.bottom) + ' slack=' + Math.round(window.innerHeight - wr.bottom) +
      ' axisWin=' + Math.round(br.height) + ' scrollable=' + body.scrollHeight +
      ' side=' + Math.round(side.getBoundingClientRect().height) +
      ' recent=' + Math.round(rec.getBoundingClientRect().height) +
      ' cols=' + document.querySelectorAll('.tk-col').length +
      ' colH=' + Math.round(document.querySelector('.tk-col').getBoundingClientRect().height));
  }
  var nav = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
    .filter(function (x) { return x.textContent.indexOf('时间轴') >= 0; })[0];
  if (!nav) { note('FAIL no nav'); return; }
  nav.click();
  setTimeout(function () { shot('before'); }, 1200);
  setTimeout(function () { shot('after'); }, 7000);
})();
