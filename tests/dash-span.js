/* Do the spans survive a drag? persistDashLayout reads them back out of the inline
   style, so a module whose style is missing would silently shrink to 2/6 and the
   user's assembled layout would be rewritten on their next drag. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[G] ' + s); } catch (e) { /* no bridge */ } }
  function qa(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function nav(t) {
    return qa('#navFilters button').filter(function (x) { return x.textContent.indexOf(t) >= 0; })[0];
  }
  function dump(tag) {
    return qa('#dashGrid .mod').map(function (m) {
      return m.dataset.mod + '=' + (m.style.gridColumn || 'EMPTY');
    }).join(' ') + ' [' + tag + ']';
  }
  function ptr(type, target, x, y) {
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse',
      button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y
    }));
  }

  nav('仪表盘').click();
  setTimeout(function () {
    API.getState().then(function (st) {
      var saved = st.settings.dashLayout || {};
      note('store span=' + JSON.stringify(saved.span) + ' order=' + (saved.order || []).join(','));
      note(dump('at boot'));
      /* drag the first module onto the second: the classic "just rearranging" */
      var mods = qa('#dashGrid .mod');
      var a = mods[0].querySelector('.mod-head').getBoundingClientRect();
      var b = mods[1].getBoundingClientRect();
      ptr('pointerdown', mods[0].querySelector('.mod-head'), a.left + 40, a.top + 6);
      ptr('pointermove', window, b.left + b.width - 12, b.top + 14);
      ptr('pointerup', window, b.left + b.width - 12, b.top + 14);
      setTimeout(function () {
        note(dump('after drag'));
        API.getState().then(function (st2) {
          note('store after=' + JSON.stringify((st2.settings.dashLayout || {}).span));
        });
      }, 700);
    });
  }, 1200);
})();
