(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[Z] ' + s); } catch (e) {} }
  var nav = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
    .filter(function (x) { return x.textContent.indexOf('时间轴') >= 0; })[0];
  nav.click();
  setTimeout(function () {
    var before = null;
    API.getState().then(function (st) { before = (st.timeEntries || []).length; })
      .then(function () {
        var t = document.querySelector('.tk-blk');
        var sel = document.querySelector('#tkPick');
        if (!sel || !sel.value) return note('FAIL no pick');
        var s = '2026-09-20T05:00:00.000Z', e = '2026-09-20T06:30:00.000Z';
        return API.op({ type: 'timer:add', id: sel.value, start: s, end: e }).then(function (res) {
          note('op=' + JSON.stringify(res));
          return API.getState().then(function (st2) {
            var mine = st2.timeEntries.filter(function (x) { return x.id === (res && res.entryId); })[0];
            note('before=' + before + ' after=' + st2.timeEntries.length + ' raw=' + JSON.stringify(mine));
          });
        });
      });
  }, 800);
})();
