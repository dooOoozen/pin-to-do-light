/* Reads the spread the way the bug looks: every box in a long-title card, what the
   CSS says its height is, and whether the region the OS was told about covers it.
   Nothing here is inferred from the stylesheet. */
(function () {
  var API = window.API, nd = window.__nd;
  function note(s) { try { API.bootNote('[S] ' + s); } catch (e) { /* no bridge */ } }
  function r(n) {
    var b = n.getBoundingClientRect();
    return Math.round(b.left) + ',' + Math.round(b.top) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height);
  }
  var dock = document.getElementById('dock');

  API.getState().then(function (st) {
    var gid = st.settings.activeGroupId;
    return API.op({
      type: 'todo:add', groupId: gid,
      title: '这是一条用来测试过行的超长任务标题它不应该超出卡片边界哪怕中文字很多也应该被裁成一行加省略号而不是溢出到卡片外面来'
    });
  }).then(function () {
    nd.autoTuck(false);
    nd.tuck(false);
    var rr = dock.getBoundingClientRect();
    var n = 0;
    var iv = setInterval(function () {
      n++;
      nd.cursorCmd(rr.left + rr.width / 2 + (n % 2 ? 4 : -4), rr.top + rr.height / 2, true);
      if (n > 8) clearInterval(iv);
    }, 90);
    setTimeout(function () {
      var cards = Array.prototype.filter.call(
        document.querySelectorAll('.todo-card'),
        function (c) { return !c.classList.contains('docked'); });
      note('loose=' + cards.length + ' ' + nd.region() + ' lag=' + nd.lag() + ' ALL=' + nd.leaks(1));
      cards.forEach(function (c) {
        var cs = getComputedStyle(c);
        var title = c.querySelector('.card-title');
        var body = c.querySelector('.card-body');
        var top = c.querySelector('.card-top');
        var tcs = title ? getComputedStyle(title) : null;
        note('card ' + r(c) + ' h=' + cs.height + ' minH=' + cs.minHeight + ' maxH=' + cs.maxHeight +
          ' ovf=' + cs.overflow + ' cls=' + c.className.replace('todo-card ', ''));
        if (title) {
          note('  body ' + r(body) + ' top ' + r(top) + ' title ' + r(title) +
            ' scrollH=' + title.scrollHeight + ' clientH=' + title.clientHeight +
            ' clamp=' + tcs.webkitLineClamp + ' disp=' + tcs.display +
            ' lh=' + tcs.lineHeight + ' fs=' + tcs.fontSize + ' lines=' + Math.round(title.scrollHeight / parseFloat(tcs.lineHeight)));
        }
      });
    }, 1400);
  });
})();
