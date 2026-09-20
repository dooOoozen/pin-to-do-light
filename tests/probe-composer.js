/* Finds which element in the entry form is still painted light: walks the subtree and
   reports any computed background whose channels are all bright. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  var tb = document.getElementById('btnTheme');
  if (tb && document.documentElement.dataset.theme !== 'ink') tb.click();
  setTimeout(function () {
    var b = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
      .filter(function (x) { return x.textContent.indexOf('全部任务') >= 0; })[0];
    if (b) b.click();
    setTimeout(function () {
      var root = document.querySelector('.composer');
      if (!root) { note('no composer'); return; }
      var hits = [];
      [root].concat(Array.prototype.slice.call(root.querySelectorAll('*'))).forEach(function (n) {
        var cs = getComputedStyle(n);
        var m = /rgba?\((\d+), *(\d+), *(\d+)/.exec(cs.backgroundColor);
        if (!m) return;
        var r = +m[1], g = +m[2], bl = +m[3];
        if (r > 170 && g > 150 && bl > 120) {
          var bb = n.getBoundingClientRect();
          hits.push(((n.getAttribute('class') || n.tagName)) + ' ' + cs.backgroundColor +
            ' ' + Math.round(bb.width) + 'x' + Math.round(bb.height));
        }
        if (cs.backgroundImage && cs.backgroundImage.indexOf('gradient') >= 0 &&
            cs.backgroundImage.indexOf('rgb') >= 0) {
          hits.push('GRADIENT ' + ((n.getAttribute('class') || n.tagName)).slice(0, 24));
        }
      });
      note('theme=' + document.documentElement.dataset.theme + ' bright=' + (hits.length ? hits.join(' | ') : 'none'));
    }, 700);
  }, 700);
})();
