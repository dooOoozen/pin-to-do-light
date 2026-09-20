/* Holds a rich spread — several long-title cards — so a crop can be compared between
   the three configurations: region on/off and GPU on/off. Only that comparison can
   tell a clipped region apart from an unpainted surface. */
(function () {
  var nd = window.__nd, API = window.API;
  function note(s) { try { API.bootNote('[H] ' + s); } catch (e) { /* no bridge */ } }
  var dock = document.getElementById('dock');
  var titles = [
    '整理下周的发布清单并且把配色和印刷厂确认一遍',
    'ENGLISH LONG TITLE THAT SHOULD NEVER BE CUT OFF BY THE REGION',
    '给时间轴加农历生日提醒并核对闰月'
  ];

  API.getState().then(function (st) {
    var gid = st.settings.activeGroupId;
    return Promise.all(titles.map(function (t) {
      return API.op({ type: 'todo:add', title: t, groupId: gid, dueAt: null });
    }));
  }).then(function () {
    nd.autoTuck(false);
    nd.tuck(false);
    var n = 0;
    setInterval(function () {
      var r = dock.getBoundingClientRect();
      n++;
      nd.cursorCmd(r.left + r.width / 2 + (n % 2 ? 5 : -5), r.top + r.height / 2 + (n % 3 ? 3 : -3), true);
      if (n === 10) {
        var loose = document.querySelectorAll('.todo-card:not(.docked)').length;
        var boxes = Array.prototype.map.call(
          document.querySelectorAll('.todo-card:not(.docked)'),
          function (c) {
            var b = c.getBoundingClientRect();
            var t = c.querySelector('.card-title');
            return Math.round(b.width) + 'x' + Math.round(b.height) +
              (t ? ' title' + Math.round(t.getBoundingClientRect().height) + '/' + t.scrollHeight : '');
          }).join(' ');
        note('mode=' + nd.hoverInfo().mode + ' loose=' + loose + ' ' + nd.region() +
          ' ALL=' + nd.leaks(1) + ' lag=' + nd.lag() + ' :: ' + boxes);
      }
    }, 110);
  });
})();
