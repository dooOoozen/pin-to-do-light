/* 右键时间轴上的任务 = 编辑这个任务 / 删除这个任务.

   Reads the menu the block actually builds: dispatches a real contextmenu event at the block's
   own coordinates, then lists the buttons that appeared. Nothing is clicked, so no task is
   edited or deleted by this test — it only checks that the two task actions are there, in that
   order, ahead of the record-only delete.

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/tk-ctx.js */
(function () {
  var API = window.API, doc = document;
  function note(s) { try { API.bootNote('[X] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var fails = [];

  function block() {
    return Array.prototype.slice.call(doc.querySelectorAll('.tk-blk[data-todo]'))
      .filter(function (n) { return n.offsetWidth > 4 && n.offsetHeight > 4; })[0];
  }

  Promise.resolve().then(function () { return wait(1400); })
    .then(function () {
      var b = Array.prototype.slice.call(doc.querySelectorAll('#navFilters button'))
        .filter(function (x) { return (x.textContent || '').indexOf('时间轴') >= 0; })[0];
      if (!b) throw new Error('no 时间轴 in #navFilters');
      b.click();
      return wait(1200);
    })
    .then(function () {
      var blk = block();
      if (!blk) throw new Error('no visible task block on the timeline');
      var r = blk.getBoundingClientRect();
      blk.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true,
        clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + Math.min(10, r.height / 2))
      }));
      return wait(150);
    })
    .then(function () {
      var menu = doc.querySelector('.tk-ctx');
      if (!menu) throw new Error('no menu appeared');
      var labels = Array.prototype.slice.call(menu.querySelectorAll('.btn')).map(function (x) { return x.textContent; });
      note('items=' + labels.length + ' :: ' + labels.join(' | '));
      /* exact, not a prefix: the report was that the quoted title does not belong in the label */
      if ((labels[0] || '') !== '编辑任务') fails.push('FIRST NOT EDIT: ' + labels[0]);
      if ((labels[1] || '') !== '删除任务') fails.push('SECOND NOT DELETE: ' + labels[1]);
      if (labels.join('').indexOf('「') >= 0) fails.push('TITLE-STILL-QUOTED ' + labels.join(' / '));
      if (!/只删这条时间记录/.test(labels[2] || '')) fails.push('THIRD NOT RECORD: ' + labels[2]);
      /* dismiss the way a real click elsewhere would */
      doc.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 4, clientY: 4 }));
      return wait(120);
    })
    .then(function () {
      if (doc.querySelector('.tk-ctx')) fails.push('MENU DID NOT CLOSE');
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS'));
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
