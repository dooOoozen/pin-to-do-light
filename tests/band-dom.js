/* Is the top strip DOM, or is it the window?
   Every probe so far has read the window from outside — style bits, DWM frame bounds, screen
   pixels — and none has asked the page the obvious question: what is at y=10? If an element
   answers, the "caption" is our own DOM and the whole non-client line of investigation was
   aimed at the wrong layer. If nothing does, the pixels belong to the window manager and the
   answer is where we left it.
   Runs in scatter mode, reading the same coordinates the pixel probes use. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[D] ' + s); } catch (e) { /* no bridge */ } }
  function desc(el) {
    if (!el) return 'null';
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    return el.tagName + '.' + (el.className || '').toString().split(' ')[0] +
      ' rect=' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) +
      ' bg=' + cs.backgroundColor + ' z=' + cs.zIndex;
  }
  setTimeout(function () {
    var deck = document.querySelector('#deckFace');
    if (deck) deck.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    setTimeout(function () {
      var pts = [[40, 10], [400, 10], [900, 12], [1500, 20], [400, 60]];
      var out = pts.map(function (p) {
        var el = document.elementFromPoint(p[0], p[1]);
        return p[0] + ',' + p[1] + '→' + desc(el);
      }).join(' | ');
      var txt = (document.body.innerText || '').replace(/\s+/g, ' ');
      note('mode=' + document.body.dataset.mode + ' inner=' + window.innerWidth + 'x' + window.innerHeight);
      note('hits: ' + out);
      note('title-in-dom=' + (txt.indexOf('卡片层') >= 0) + ' bodyText=' + JSON.stringify(txt.slice(0, 90)));
      var rs = document.body.getBoundingClientRect();
      note('body rect=' + Math.round(rs.left) + ',' + Math.round(rs.top) + ' ' + Math.round(rs.width) + 'x' + Math.round(rs.height) +
        ' clientTop=' + document.documentElement.clientTop + ' clientLeft=' + document.documentElement.clientLeft);
    }, 2500);
  }, 1500);
})();
