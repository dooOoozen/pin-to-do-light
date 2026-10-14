/* 设置最后的「关于」到底说清楚了没有。

   报告要的是：github 主页、检查更新之类的。这里核对面板在不在最后、版本号和仓库地址是不是从
   宿主拿到的真值、数据文件路径有没有写出来，然后真的按一次「检查更新」，把面板上出现的那句话
   原样记下来 —— 能不能连上 GitHub 是这台机器的网络决定的，测出来是什么就报什么，不假装成功。
   不会去按「打开仓库主页」：那会在第二屏之外弹出一个浏览器。

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/about-lab.js */
(function () {
  var API = window.API, doc = document;
  function note(s) { try { API.bootNote('[B] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var fails = [];
  function q(sel) { return doc.querySelector(sel); }
  function txt(sel) { var n = q(sel); return n ? (n.textContent || '').trim() : ''; }
  function click(sel) {
    var n = q(sel);
    if (!n) { fails.push('NO-BUTTON ' + sel); return false; }
    n.click();
    return true;
  }

  Promise.resolve().then(function () { return wait(1500); })
    .then(function () { return click('#btnSettings'); })
    .then(function () { return wait(900); })
    .then(function () {
      var heads = Array.prototype.slice.call(doc.querySelectorAll('.modal-root .panel h3')).map(function (n) {
        return (n.textContent || '').trim();
      });
      var last = heads[heads.length - 1] || '';
      note('panels=' + heads.length + ' last=' + last);
      if (last.indexOf('关于') < 0) fails.push('ABOUT-NOT-LAST ' + last);

      var ver = txt('#aboutVer'), repo = txt('#aboutRepo'), data = txt('#aboutData');
      note('ver=' + ver + ' repo=' + repo + ' data=' + data);
      if (!/^\/\/ v\d+\.\d+/.test(ver)) fails.push('VERSION ' + ver);
      if (repo.indexOf('https://github.com/') !== 0) fails.push('REPO ' + repo);
      if (!/\.json$/.test(data)) fails.push('DATA-PATH ' + data);
      if (!q('[data-act="repoHome"]') || !q('[data-act="checkUpdate"]')) fails.push('BUTTONS-MISSING');
      return click('[data-act="checkUpdate"]');
    })
    .then(function () { return wait(4500); })
    .then(function () {
      var out = txt('#aboutUpd');
      note('update=' + out);
      if (!out || /正在查询/.test(out)) fails.push('UPDATE-STUCK "' + out + '"');
      var cb = q('.modal-root [data-act="done"]');
      if (cb) cb.click();
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS'));
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
