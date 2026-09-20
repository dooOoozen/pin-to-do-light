/* Separates two different "the card is missing a piece" causes: the region clipping
   the painted box, versus the title being truncated by CSS line-clamp. Adds a long
   title, opens the spread, and reports both. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[X] ' + s); } catch (e) { /* no bridge */ } }
  var long1 = '这是一条非常长的任务标题用来测试悬停展开时是否被截断它应该超过一行甚至两行才对啊';
  var long2 = 'ENGLISH LONG TITLE CHECK FOR THE SPREAD CHIP THAT SHOULD NOT BE CUT OFF AT ALL';
  var dock = document.getElementById('dock');

  function report(tag) {
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll('.todo-card'), function (c) {
      if (c.classList.contains('docked')) return;
      var t = c.querySelector('.card-title');
      if (!t) return;
      var b = c.getBoundingClientRect();
      var tb = t.getBoundingClientRect();
      out.push('"' + (t.textContent || '').slice(0, 8) + '" card=' +
        Math.round(b.width) + 'x' + Math.round(b.height) +
        ' title=' + Math.round(tb.width) + 'x' + Math.round(tb.height) +
        ' clamp=' + getComputedStyle(t).webkitLineClamp +
        ' clipped=' + (t.scrollHeight > tb.height + 2 || t.scrollWidth > tb.width + 2));
    });
    note(tag + ' ' + nd.region() + ' ALL=' + nd.leaks(1) + ' :: ' + (out.join(' ;; ') || 'no loose cards'));
  }

  API.getState().then(function (st) {
    var gid = st.settings.activeGroupId;
    return Promise.all([
      API.op({ type: 'todo:add', title: long1, groupId: gid, dueAt: null }),
      API.op({ type: 'todo:add', title: long2, groupId: gid, dueAt: null })
    ]);
  }).then(function () {
    nd.autoTuck(false);
    nd.tuck(false);
    var r = dock.getBoundingClientRect();
    var n = 0;
    var iv = setInterval(function () {
      n++;
      nd.cursorCmd(r.left + r.width / 2 + (n % 2 ? 4 : -4), r.top + r.height / 2, true);
      if (n > 8) { clearInterval(iv); report('spread'); }
    }, 90);
    setTimeout(function () { report('settled'); }, 2200);
  });
})();
