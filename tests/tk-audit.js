/* Audit of the six reported tracking problems, all measured from the DOM:
   half-hour scale, the block drag that also opened the editor, the recent list's
   date and running duration, the ring's dial labels, the strip of empty panel under
   the axis, and the reserved scrollbar gutter. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[A] ' + s); } catch (e) { /* no bridge */ } }
  function q(s) { return document.querySelector(s); }
  function n(s) { return document.querySelectorAll(s).length; }
  function ptr(target, type, x, y) {
    (target || document).dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, isPrimary: true,
      button: 0, buttons: 1, clientX: x, clientY: y
    }));
  }
  function modalOpen() { return n('#modalRoot .modal-panel') > 0; }
  var before = {};

  var nav = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
    .filter(function (x) { return x.textContent.indexOf('时间轴') >= 0; })[0];
  if (!nav) { note('FAIL no 时间轴'); return; }
  nav.click();

  setTimeout(function () {
    var main = q('.main');
    note('scale hour=' + n('.tk-hline:not(.half)') + ' half=' + n('.tk-hline.half') +
      ' gutHalf=' + n('.tk-gut-h.half') + ' gutHour=' + n('.tk-gut-h:not(.half)') +
      ' (cols=' + n('.tk-col') + ')');
    note('gutter main offset=' + main.offsetWidth + ' client=' + main.clientWidth +
      ' gap=' + (main.offsetWidth - main.clientWidth) +
      ' viewW=' + window.innerWidth + ' docW=' + document.documentElement.clientWidth);

    var wrap = q('.tkx'), body = q('.tk-body'), side = q('.tk-side');
    var wr = wrap.getBoundingClientRect(), br = body.getBoundingClientRect();
    note('fit wrap=' + Math.round(wr.height) + ' bottom=' + Math.round(wr.bottom) +
      ' vh=' + window.innerHeight + ' slackBelow=' + Math.round(window.innerHeight - wr.bottom) +
      ' axisWin=' + Math.round(br.height) + ' side=' + Math.round(side.getBoundingClientRect().height) +
      ' day=' + Math.round(q('.tk-grid').getBoundingClientRect().height));

    /* the dial: four marks, each inside the wrap */
    var ringWrap = q('.tk-ring-wrap').getBoundingClientRect();
    var labels = Array.prototype.slice.call(document.querySelectorAll('.tk-ring-hours span'));
    note('ring labels=' + labels.length + '[' + labels.map(function (s) { return s.textContent; }).join(',') +
      '] inside=' + labels.every(function (s) {
        var r = s.getBoundingClientRect();
        return r.left >= ringWrap.left - 1 && r.right <= ringWrap.right + 1 &&
          r.top >= ringWrap.top - 1 && r.bottom <= ringWrap.bottom + 1;
      }) + ' hole=' + Math.round(q('.tk-ring').getBoundingClientRect().width));

    /* the recent list: local date beside local time, and a running row that counts */
    var first = q('#tkRecent .tk-entry');
    note('recent rows=' + n('#tkRecent .tk-entry') + ' head=' +
      (first ? first.querySelector('.tk-e-time').textContent + ' | ' +
        first.querySelector('.tk-e-name').textContent.slice(0, 8) + ' | ' +
        first.querySelector('.tk-e-ms').textContent : '-') +
      ' live=' + n('[data-live-ms]') + ' count=' + (q('#tkRecN') || { textContent: '' }).textContent);
    run();
  }, 1200);

  function run() {
    /* seed one run to drag: the axis is empty on a clean board */
    var sel = q('#tkPick');
    if (!sel || !sel.value) { note('FAIL no task to time'); return; }
    var now = new Date();
    var a = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0).getTime();
    API.getState().then(function (st) {
      before = {};
      (st.timeEntries || []).forEach(function (x) { before[x.id] = 1; });
      return API.op({ type: 'timer:add', id: sel.value, start: new Date(a).toISOString(), end: new Date(a + 75 * 60000).toISOString() });
    }).then(function () { setTimeout(dragBlock, 900); });
  }

  function dragBlock() {
    var blk = q('.tk-blk');
    if (!blk) { note('FAIL no block to drag'); return; }
    var r = blk.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + 5;
    /* 1. a real drag: 60px of travel must move the block and NOT open the editor */
    ptr(blk, 'pointerdown', x, y);
    ptr(document, 'pointermove', x, y + 30);
    ptr(document, 'pointermove', x, y + 60);
    ptr(document, 'pointerup', x, y + 60);
    setTimeout(function () {
      var moved = q('.tk-blk[data-entry="' + blk.dataset.entry + '"]');
      note('drag top ' + Math.round(r.top) + '->' + Math.round(moved.getBoundingClientRect().top) +
        ' modalAfterDrag=' + modalOpen());
      clickBlock();
    }, 900);
  }

  function clickBlock() {
    var blk = q('.tk-blk');
    var r = blk.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    /* 2. a still press must still open the editor */
    ptr(blk, 'pointerdown', x, y);
    ptr(document, 'pointerup', x, y);
    blk.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    setTimeout(function () {
      note('click modal=' + modalOpen() +
        ' title=' + (q('.modal-panel .modal-title') || { textContent: '' }).textContent);
      var close = q('.modal-panel [data-act="close"]') || q('.modal-panel .icon-btn');
      if (close) close.click();
      setTimeout(liveRow, 500);
    }, 700);
  }

  function liveRow() {
    /* Open a run that started 70 minutes ago. The stored entry has ms=0, so the only
       way the row can read 01:10 is the live computation — and after a real minute it
       has to read 01:11, which is the part that was frozen. (An earlier version of
       this check waited 3s on a run started now and compared two "00:00"s: hm() is
       minute-granular, so it could not have detected anything.) */
    var sel = q('#tkPick');
    var start = Date.now() - 70 * 60000;
    API.op({ type: 'timer:add', id: sel.value, start: new Date(start).toISOString() }).then(function () {
      setTimeout(function () {
        var row = q('#tkRecent .tk-entry.open');
        var t0 = row ? row.querySelector('.tk-e-ms').textContent : 'no-row';
        note('live70m row=' + t0 + ' want=01:10 liveAttr=' + n('[data-live-ms]'));
        setTimeout(function () {
          var r2 = q('#tkRecent .tk-entry.open');
          note('live62s later=' + (r2 ? r2.querySelector('.tk-e-ms').textContent : 'gone') +
            ' was=' + t0 + ' advanced=' + (!!r2 && r2.querySelector('.tk-e-ms').textContent !== t0));
          stopIt();
        }, 62000);
      }, 900);
    });
  }

  function stopIt() {
    API.getState().then(function (st) {
      var e = null;
      (st.timeEntries || []).forEach(function (x) { if (!x.end) e = x; });
      if (!e) { note('FAIL no open entry to stop'); return; }
      API.op({ type: 'timer:add', id: e.todoId, start: e.start, end: new Date().toISOString() })
        .then(cleanup);
    });
  }

  /* Delete only what this audit laid down. Taking the whole array apart here would
     destroy the user's real history the first time anyone ran it on a live board. */
  function cleanup() {
    API.getState().then(function (st) {
      var mine = (st.timeEntries || []).map(function (x) { return x.id; })
        .filter(function (id) { return !before.hasOwnProperty(id); });
      var p = Promise.resolve();
      mine.forEach(function (id) {
        p = p.then(function () { return API.op({ type: 'timer:delete', id: id }); });
      });
      p.then(function () { return API.getState(); }).then(function (st2) {
        note('cleanup deleted=' + mine.length + ' left=' + (st2.timeEntries || []).length);
      });
    });
  }
})();
