/* 最近记录 must not list what has not happened yet.

   A block dragged to a future hour is a plan. It belongs on the timeline, not in the list of
   records, and on this machine six of the twenty-four entries sit in the future right now, so the
   assertion has teeth without the test having to create anything: it reads the store, works out
   how many rows the list is allowed to show, and compares that with what is actually there.

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/tk-recent.js */
(function () {
  var API = window.API, doc = document;
  function note(s) { try { API.bootNote('[R] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var fails = [];

  API.getState().then(function (st) {
    var b = Array.prototype.slice.call(doc.querySelectorAll('#navFilters button'))
      .filter(function (x) { return (x.textContent || '').indexOf('时间轴') >= 0; })[0];
    if (!b) throw new Error('no 时间轴 in #navFilters');
    b.click();
    return wait(1200);
  })
    .then(function () { return API.getState(); })
    .then(function (st) {
      var now = Date.now();
      var all = st.timeEntries || [];
      var past = all.filter(function (e) { return new Date(e.start).getTime() <= now; });
      var future = all.length - past.length;
      var rows = doc.querySelectorAll('#tkRecent .tk-entry');
      var shown = doc.getElementById('tkRecN');
      var count = shown ? parseInt(shown.textContent, 10) : -1;
      var wantRows = Math.min(20, past.length);
      note('entries=' + all.length + ' past=' + past.length + ' future=' + future +
        ' rows=' + rows.length + ' header=' + count);
      if (!future) note('note: nothing in the future right now, so the filter is untested here');
      if (rows.length !== wantRows) fails.push('ROWS ' + rows.length + ' want ' + wantRows);
      if (count !== past.length) fails.push('HEADER ' + count + ' want ' + past.length);
      /* the newest allowed row is the first one; if a future entry had slipped through it would
         be first, because the list is built from the reversed store */
      var first = rows[0] ? rows[0].querySelector('.tk-e-time') : null;
      note('first row = ' + (first ? first.textContent.trim() : 'none'));
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS'));
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
