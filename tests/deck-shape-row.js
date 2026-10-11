/* Where the deck-shape switch lives, and what it is called.

   It used to sit down in the general toggles list, far from the two rows that decide where
   the deck is and how it looks, and the widget had two names in the interface — 卡盒 in most
   places, 卡片堆 in a handful. Both are cheap to get wrong again because nothing but this
   test reads the settings body as the user sees it.

   卡片堆 is still allowed as the name of the *shape* (卡片堆 vs 胶囊); it is only banned as
   the name of the thing itself.

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/deck-shape-row.js */
(function () {
  var API = window.API;
  var fails = [], notes = [];
  function note(s) { try { API.bootNote('[P] ' + s); } catch (e) { /* no bridge */ } }
  function check(ok, label) { if (!ok) fails.push(label); }
  function labels(sel) {
    var host = document.querySelector(sel);
    if (!host) return null;
    return Array.prototype.map.call(host.querySelectorAll('.set-label'), function (n) {
      return (n.textContent || '').trim();
    });
  }
  var before = null;

  document.getElementById('btnSettings').click();
  setTimeout(function () {
    var iface = labels('#panelInterface'), toggles = labels('#panelToggles');
    check(iface, '#panelInterface missing');
    check(toggles, '#panelToggles missing');
    if (!iface || !toggles) { note('RESULT FAIL ' + fails.join(' | ')); return; }

    var shape = -1, mon = -1;
    iface.forEach(function (t, i) {
      if (t.indexOf('卡盒改用胶囊样式') >= 0) shape = i;
      if (t.indexOf('卡盒所在屏幕') >= 0) mon = i;
    });
    check(shape >= 0, 'no 卡盒改用胶囊样式 row in 界面, saw: ' + JSON.stringify(iface));
    check(mon >= 0, 'no 卡盒所在屏幕 row in 界面, saw: ' + JSON.stringify(iface));
    check(shape >= 0 && mon >= 0 && shape === mon - 1,
      'shape row ' + shape + ' is not directly above the screen row ' + mon);
    check(!toggles.some(function (t) { return t.indexOf('胶囊') >= 0; }),
      'the shape switch is still in the general toggles list');

    var widget = iface.concat(toggles).filter(function (t) { return t.indexOf('卡片堆') >= 0; });
    check(!widget.length, 'a settings label still calls the deck 卡片堆: ' + JSON.stringify(widget));
    check(toggles.some(function (t) { return t === '卡盒自动缩进屏幕'; }),
      'the auto-tuck row is not called 卡盒自动缩进屏幕, saw: ' + JSON.stringify(toggles));
    notes.push('iface=' + JSON.stringify(iface));

    /* and the row has to still be a working switch, not just a caption in a new place */
    API.getState().then(function (st) {
      before = st.settings.deckShape;
      var sw = document.querySelectorAll('#panelInterface .set-row')[shape].querySelector('.switch');
      check(!!sw, 'the shape row has no switch control');
      if (!sw) return null;
      check((sw.classList.contains('on')) === (before === 'pill'),
        'the switch reads ' + sw.className + ' against deckShape=' + before);
      sw.click();
      return new Promise(function (r) { setTimeout(r, 700); });
    }).then(function () {
      if (!before) return null;
      return API.getState().then(function (st) {
        var want = before === 'pill' ? 'stack' : 'pill';
        check(st.settings.deckShape === want,
          'after the click deckShape=' + st.settings.deckShape + ', want ' + want);
        notes.push('shape ' + before + '->' + st.settings.deckShape);
        return API.op({ type: 'settings:update', patch: { deckShape: before } });
      });
    }).then(function () {
      return API.getState();
    }).then(function (st) {
      if (before) check(st.settings.deckShape === before,
        'deckShape not put back: ' + st.settings.deckShape + ' vs ' + before);
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS') + ' ' + notes.join(' | '));
    }).catch(function (e) {
      note('RESULT FAIL threw: ' + (e && e.message) + ' | ' + fails.join(' | '));
    });
  }, 900);
})();
