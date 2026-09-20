/* Exercises the vertical axis the way it will be used: read the structure, drag a
   range out of empty space, assign it, then move that block and confirm the store
   followed. Every step asserts on the DOM, not on how it looks. */
(function () {
  var API = window.API;
  function note(s) { try { API.bootNote('[T] ' + s); } catch (e) { /* no bridge */ } }
  function q(sel) { return document.querySelector(sel); }
  function ptr(target, type, x, y) {
    (target || document).dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 3, isPrimary: true,
      button: 0, buttons: 1, clientX: x, clientY: y
    }));
  }

  function structure() {
    note('cols=' + document.querySelectorAll('.tk-col').length +
      ' hlines=' + document.querySelectorAll('.tk-hline').length +
      ' gut=' + document.querySelectorAll('.tk-gut-h').length +
      ' caps=' + document.querySelectorAll('.tk-cap').length +
      ' ring=' + (q('.tk-ring') ? ((q('.tk-ring').style.backgroundImage || q('.tk-ring').style.background).match(/%/g) || []).length / 2 : 'NONE') +
      ' side=' + !!q('.tk-side') + ' sum=' + (q('#tkSum') ? q('#tkSum').textContent.replace(/\s+/g, ' ') : '-'));
  }

  function dragRange() {
    var col = document.querySelectorAll('.tk-col')[2];
    if (!col) return note('FAIL no third column');
    var r = col.getBoundingClientRect();
    var bodyEl = q('.tk-body');
    var br = bodyEl.getBoundingClientRect();
    var x = r.left + r.width / 2;
    /* The view opens scrolled to the running hour, so a fixed offset from the top of
       the 1008px column can be far above the window — elementFromPoint then returns
       nothing and the gesture "fails" on a working build. Press where it is visible. */
    var y = Math.max(br.top + 24, Math.min(br.bottom - 60, r.top + 100));
    var hit = document.elementFromPoint(x, y);
    note('press@' + Math.round(x) + ',' + Math.round(y) + ' colTop=' + Math.round(r.top) +
      ' win=' + Math.round(br.top) + '..' + Math.round(br.bottom) +
      ' hits=' + (hit ? (hit.className || hit.tagName) + '' : 'null') +
      ' colBox=' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (!hit || !(hit.closest && hit.closest('.tk-col'))) return note('FAIL press not on a column');
    ptr(hit, 'pointerdown', x, y);
    ptr(document, 'pointermove', x, y + 90);
    ptr(document, 'pointerup', x, y + 90);
    setTimeout(function () {
      var pop = q('.tk-pop');
      note('popover=' + (pop ? 'OPEN ' + pop.querySelector('.tk-pop-h').textContent : 'MISSING') +
        ' draftHidden=' + (q('.tk-draft') ? q('.tk-draft').classList.contains('u-hidden') : '-'));
      if (!pop) return;
      var sel = pop.querySelector('[data-tk="pick"]');
      if (sel.options.length < 2) return note('FAIL no tasks to assign');
      note('placeholder="' + sel.options[0].textContent + '" value="' + sel.options[0].value + '"');
      /* options[0] is the "choose a task" blank on purpose, so pick the first real one */
      sel.value = sel.options[1].value;
      var beforeIds = null;
      API.getState().then(function (st) {
        /* Diff the ID sets rather than reading the tail of the array. timeEntries is
           sorted by start time, so "last element" is whichever run happens to end
           latest — with zero-length debris from earlier rounds in the store it
           reported a 90-minute creation as span=0min. */
        beforeIds = new Set(st.timeEntries.map(function (x) { return x.id; }));
        pop.querySelector('[data-tk="go"]').click();
        setTimeout(function () {
          API.getState().then(function (st) {
            var added = st.timeEntries.filter(function (x) { return !beforeIds.has(x.id); });
            var e = added[0];
            note('created entries=' + st.timeEntries.length + ' added=' + added.length +
              ' span=' + (e ? Math.round((new Date(e.end) - new Date(e.start)) / 60000) : '-') + 'min' +
              ' blocks=' + document.querySelectorAll('.tk-blk').length +
              ' recent=' + document.querySelectorAll('#tkRecent .tk-entry').length);
            moveBlock(e);
          });
        }, 700);
      });
    }, 300);
  }

  function moveBlock(e) {
    if (!e) return;
    var blk = q('.tk-blk[data-entry="' + e.id + '"]');
    if (!blk) return note('FAIL block not found for move');
    var r = blk.getBoundingClientRect();
    var before = blk.style.top;
    var col = blk.closest('.tk-col');
    ptr(blk, 'pointerdown', r.left + r.width / 2, r.top + 4);
    ptr(document, 'pointermove', r.left + r.width / 2, r.top + 4 + 84);
    ptr(document, 'pointerup', r.left + r.width / 2, r.top + 4 + 84);
    setTimeout(function () {
      API.getState().then(function (st) {
        var now = st.timeEntries.filter(function (x) { return x.id === e.id; })[0];
        note('moved top ' + before + ' -> ' + (q('.tk-blk[data-entry="' + e.id + '"]') || { style: {} }).style.top +
          ' startShift=' + (now ? Math.round((new Date(now.start) - new Date(e.start)) / 60000) : '-') + 'min' +
          ' spanStill=' + (now ? Math.round((new Date(now.end) - new Date(now.start)) / 60000) : '-') + 'min');
        lateRange();
      });
    }, 700);
  }

  /* The bottom of the day is where a scroll container that sizes itself wrong stops
     existing: the press point is off the column's box, so the gesture dies at ~11:00.
     Scroll to the end and press there. */
  function lateRange() {
    var bodyEl = q('.tk-body');
    if (!bodyEl) return note('FAIL no .tk-body');
    bodyEl.scrollTop = 99999;
    setTimeout(function () {
      var col = document.querySelectorAll('.tk-col')[1];
      var r = col.getBoundingClientRect();
      var x = r.left + r.width / 2;
      var y = Math.min(window.innerHeight - 24, r.bottom - 24);
      var hit = document.elementFromPoint(x, y);
      note('latePress scroll=' + Math.round(bodyEl.scrollTop) + ' colBox=' +
        Math.round(r.width) + 'x' + Math.round(r.height) + ' top=' + Math.round(r.top) +
        ' hits=' + (hit ? (hit.className || hit.tagName) : 'null'));
      if (!hit) return views();
      ptr(hit, 'pointerdown', x, y);
      ptr(document, 'pointermove', x, y - 42);
      ptr(document, 'pointerup', x, y - 42);
      setTimeout(function () {
        var pop = q('.tk-pop');
        note('latePopover=' + (pop ? pop.querySelector('.tk-pop-h').textContent : 'MISSING'));
        if (pop) {
          q('.tk-head').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        }
        views();
      }, 350);
    }, 350);
  }

  /* the close button on a block: delete from the axis, not only from the recent list */
  function delBlock() {
    var x = q('.tk-blk [data-tkdel]');
    if (!x) return note('FAIL no delete button on any block');
    API.getState().then(function (st) {
      var before = st.timeEntries.length;
      x.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      setTimeout(function () {
        API.getState().then(function (st2) {
          note('delete ' + before + '->' + st2.timeEntries.length +
            ' blocks=' + document.querySelectorAll('.tk-blk').length);
        });
      }, 800);
    });
  }

  function views() {
    var day = Array.prototype.slice.call(document.querySelectorAll('[data-tk="day"]'))[0];
    if (day) day.click();
    setTimeout(function () {
      note('dayView cols=' + document.querySelectorAll('.tk-col').length);
      var wk = q('[data-tk="week"]');
      if (wk) wk.click();
      setTimeout(function () {
        note('backToWeek cols=' + document.querySelectorAll('.tk-col').length);
        var nx = q('[data-tk="next"]');
        if (nx) nx.click();
        setTimeout(function () {
          note('nextWeek range=' + (q('.tk-range') ? q('.tk-range').textContent : '-') +
            ' blocks=' + document.querySelectorAll('.tk-blk').length);
          var td = q('[data-tk="today"]');
          if (td) td.click();
          setTimeout(delBlock, 600);
        }, 400);
      }, 400);
    }, 400);
  }

  var nav = Array.prototype.slice.call(document.querySelectorAll('#navFilters button'))
    .filter(function (x) { return x.textContent.indexOf('时间轴') >= 0; })[0];
  if (!nav) return note('FAIL no 时间轴 nav');
  nav.click();
  setTimeout(function () { structure(); dragRange(); }, 700);
})();
