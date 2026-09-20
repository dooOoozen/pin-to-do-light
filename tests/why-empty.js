/* Installs an error hook, then switches to the tracking view and reports whatever the
   page threw — the fastest way to a real cause instead of a guess. */
(function () {
  var API = window.API;
  var seen = [];
  window.addEventListener('error', function (e) {
    seen.push((e.message || 'err') + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno);
  });
  function note(s) { try { API.bootNote('[E] ' + s); } catch (x) {} }
  var nav = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
    .filter(function (x) { return x.textContent.indexOf('时间轴') >= 0; })[0];
  if (!nav) return note('FAIL no nav');
  nav.click();
  setTimeout(function () {
    note('errors=' + (seen.join(' || ') || 'none') +
      ' panel=' + (document.getElementById('viewPanel') || { className: 'gone' }).className +
      ' children=' + (document.getElementById('viewPanel') || { children: [] }).children.length +
      ' html=' + ((document.getElementById('viewPanel') || {}).innerHTML || '').slice(0, 60));
  }, 900);
})();
