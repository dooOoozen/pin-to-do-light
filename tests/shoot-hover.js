/* The panel half of the ledger hover clip: put the window on the view the README uses, in
   the material the original clip was shot in, and report where the two blocks are in CSS px.
   The recorder works in screen pixels and the webview is zoomed, so tools/shoot-hover.sh
   converts these with the window rect — measuring the crop off the CSS numbers is what cut
   the previous plates off mid-panel.

   Nothing here moves the cursor. The hover has to come from a real SetCursorPos, because a
   scripted MouseEvent would light up a row the user could never point at.

   Paired with tools/shoot-hover.sh. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function r(n) { return Math.round(n); }
  function box(el) {
    if (!el) return null;
    var b = el.getBoundingClientRect();
    return [r(b.left), r(b.top), r(b.right), r(b.bottom)];
  }
  function clickNav(text) {
    var b = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
      .filter(function (x) { return (x.textContent || '').indexOf(text) >= 0; })[0];
    if (b) b.click();
    return !!b;
  }
  var before = null;
  Promise.resolve()
    .then(function () { return API.getState(); })
    .then(function (st) {
      before = { style: st.settings.style, theme: st.settings.theme };
      note('begin (borrowed ' + before.style + '/' + before.theme + ')');
      return API.op({ type: 'settings:update', patch: { style: 'diner', theme: 'paper' } });
    })
    .then(function () { return wait(1400); })
    .then(function () {
      note('clicked 全部任务: ' + clickNav('全部任务'));
      return wait(1600);
    })
    .then(function () {
      var rows = Array.prototype.slice.call(document.querySelectorAll('.list .task'));
      var target = rows[1] || rows[0];
      var geo = {
        css: [innerWidth, innerHeight], dpr: devicePixelRatio,
        style: document.documentElement.getAttribute('data-style'),
        composer: box(document.querySelector('.composer')),
        list: box(document.querySelector('.list-wrap')),
        row: box(target),
        last: box(rows[rows.length - 1]),
        rows: rows.length,
        titles: rows.slice(0, 4).map(function (el) {
          var t = el.querySelector('.task-title');
          return t ? t.textContent : '?';
        })
      };
      note('GEOM ' + JSON.stringify(geo));
      note('HOVER-READY');
      /* stay put: the recorder drives the real cursor and then the shell restores the
         material, so the page must not do anything on its own */
      return new Promise(function () {});
    })
    .catch(function (e) { note('ERROR ' + (e && e.message)); });
})();
