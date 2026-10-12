/* Two controls added on the same pass, and the arithmetic that goes with the second one.
   The user's note on the ring said 注意此处 — the ring has to be the SAME period as the
   figures above it, not the fourteen-day window the columns beside it show. So the test
   asserts the ring's own caption equals the range label, and its centre total equals the
   TOTAL figure, in three periods and after paging twice back.

   The month grid's jump has the different job: picking a date in another month has to move
   the grid as well as the selection, or the calendar shows a day it is not displaying.

   Run on the second display:
     pin-tauri.exe --monitor 2 --panel --test-script-panel tests/rp-cal-controls.js */
(function () {
  var API = window.API;
  var fails = [], notes = [];
  function note(s) { try { API.bootNote('[K] ' + s); } catch (e) { /* no bridge */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function check(ok, label) { if (!ok) fails.push(label); }
  function q(sel) { return document.querySelector(sel); }
  function nav(text) {
    return Array.prototype.slice.call(document.querySelectorAll('#navFilters button')).filter(function (b) {
      return (b.textContent || '').indexOf(text) >= 0;
    })[0];
  }
  function label() { return q('.rp-range-label') ? q('.rp-range-label').textContent : ''; }
  function pager(step) {
    var btns = Array.prototype.slice.call(document.querySelectorAll('.rp-bar .btn'));
    var want = step < 0 ? '\u2039' : '\u203A';
    var b = btns.filter(function (x) { return x.textContent === want; })[0];
    if (b) b.click();
    return !!b;
  }

  /* the ring's centre figure and the TOTAL figure are the same number read two ways */
  function ringAgrees(where) {
    var band = q('.rp-ring-band'), cap = q('.rp-ring-cap'), centre = q('.rp-ring b');
    var total = Array.prototype.slice.call(document.querySelectorAll('.rp-fig')).filter(function (n) {
      return (n.textContent || '').indexOf('TOTAL') >= 0;
    })[0];
    check(!!band && !!cap && !!centre, where + ': the ring is not on screen');
    if (!band || !cap || !centre || !total) return;
    var bg = band.style.backgroundImage || '';
    check(bg.indexOf('conic-gradient(') === 0, where + ': the band is not a conic gradient: ' + bg.slice(0, 40));
    check(cap.textContent === label(), where + ': ring says "' + cap.textContent + '" but the range is "' + label() + '"');
    var tv = (total.querySelector('.rp-fig-v') || {}).textContent;
    check(centre.textContent === tv, where + ': ring centre ' + centre.textContent + ' vs TOTAL ' + tv);
    notes.push(where + ' ring=' + centre.textContent + ' slices=' + (bg.split(',').length) + ' cap=' + cap.textContent);
  }

  Promise.resolve().then(function () { return wait(2400); })
    .then(function () { return API.op({ type: 'sample:load' }); })
    .then(function () { return wait(700); })
    /* ---- the ledger: three periods, then paging ---- */
    .then(function () { nav('时间账本').click(); return wait(800); })
    .then(function () {
      check(!!q('.rp-ring'), 'no ring beside the columns');
      ringAgrees('本周');
      var week = label();
      check(pager(-1), 'no previous-period button');
      return wait(600).then(function () {
        check(label() !== week, 'paging back left the label at ' + label());
        check(/上周|WEEK/.test(label()), 'paging back did not read as a week: ' + label());
        ringAgrees('上周');
        pager(-1);
        return wait(600).then(function () {
          notes.push('two back = ' + label());
          check(/WEEK/.test(label()), 'two periods back is not a week: ' + label());
          return null;
        });
      });
    })
    .then(function () {
      /* choosing a period has to come back to the present, not stay three weeks gone */
      var kinds = Array.prototype.slice.call(document.querySelectorAll('.rp-bar .btn')).filter(function (b) {
        return b.textContent === '本月';
      })[0];
      if (kinds) kinds.click();
      return wait(700).then(function () {
        check(label().indexOf('本月') === 0, 'choosing 本月 did not reset the page: ' + label());
        ringAgrees('本月');
        var day = Array.prototype.slice.call(document.querySelectorAll('.rp-bar .btn')).filter(function (b) {
          return b.textContent === '今天';
        })[0];
        if (day) day.click();
        return wait(700).then(function () {
          check(label().indexOf('今天') === 0, 'today button: ' + label());
          ringAgrees('今天');
          return null;
        });
      });
    })
    /* ---- the month grid: jump into another month ---- */
    .then(function () { nav('月历').click(); return wait(800); })
    .then(function () {
      var jump = q('#calJump');
      check(!!jump, 'no date jump field in the month view');
      if (!jump) return null;
      var before = q('.cal-title') ? q('.cal-title').textContent : '';
      var d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 2);
      var key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-0' +
        Math.min(9, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
      jump.value = key;
      jump.dispatchEvent(new Event('change', { bubbles: true }));
      return wait(800).then(function () {
        var after = q('.cal-title') ? q('.cal-title').textContent : '';
        notes.push('cal ' + before + ' → ' + after + ' on ' + key);
        check(after !== before, 'jumping to ' + key + ' left the month at ' + after);
        check(after.indexOf(String(d.getMonth() + 1)) >= 0, 'the month title does not name ' + (d.getMonth() + 1) + '月: ' + after);
        var sel = document.querySelector('.cal-cell.sel');
        check(!!sel, 'no day cell looks selected after the jump');
        return null;
      });
    })
    .then(function () { return API.op({ type: 'sample:clear' }); })
    .then(function () { return wait(500); })
    .then(function () {
      note('RESULT ' + (fails.length ? 'FAIL ' + fails.join(' | ') : 'PASS') + ' ' + notes.join(' | '));
    })
    .catch(function (e) { note('RESULT ERROR ' + (e && e.message)); });
})();
