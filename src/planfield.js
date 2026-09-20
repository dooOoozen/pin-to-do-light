/**
 * DASHBOARD 1971 — plan & repeat widget (shared by the composer and the editors).
 * Fully custom, print-styled pickers (no native date/time popups) plus
 * TickTick-style repeat rules: 每周三 / 每月5日 / 每年5月10日 with an end
 * condition (never / until a date / after N occurrences).
 */
(function () {
  'use strict';

  var D = window.NeonData;
  var WEEK = D.WEEKDAY_CN;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function combine(dateStr, timeStr) {
    if (!dateStr) return null;
    var parts = dateStr.split('-');
    var t = (timeStr || '09:00').split(':');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), Number(t[0]) || 0, Number(t[1]) || 0, 0, 0);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  function toDateInput(v) {
    var d = D.parseDate(v);
    if (!d) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function toTimeInput(v) {
    var d = D.parseDate(v);
    if (!d) return '';
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* repeat choices derived from the selected date */
  function repeatOptions(dueAt, lunar) {
    var d = D.parseDate(dueAt);
    var out = [{ value: 'none', label: '不重复' }];
    out.push({ value: 'daily', label: '每天' });
    if (d) {
      out.push({ value: 'weekly', label: '每周' + WEEK[d.getDay()] });
      out.push({ value: 'monthly', label: '每月' + d.getDate() + '日' });
      out.push({ value: 'yearly', label: '每年' + (d.getMonth() + 1) + '月' + d.getDate() + '日' });
      /* the same day read on the lunar calendar, because that is how birthdays and
         the old festivals are actually kept: 9月7日 → 每年农历七月廿六 */
      var ln = lunarNameOf(d);
      if (ln) out.push({ value: 'lunarYearly', label: '每年农历' + ln });
    }
    return out;
  }

  function lunarNameOf(d) {
    var L = window.NeonLunar;
    if (!L || !L.solarToLunar || !L.lunarName) return null;
    var l = L.solarToLunar(d);
    return l ? L.lunarName(l.month, l.day, l.isLeap) : null;
  }

  function planText(dueAt, repeat, lunar, extra) {
    var d = D.parseDate(dueAt);
    var bits = [];
    if (d) {
      var now = new Date();
      var same = function (a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
      var dayLabel = same(d, now) ? '今天' : (same(d, addDays(now, 1)) ? '明天' : (same(d, addDays(now, 2)) ? '后天' : (d.getMonth() + 1) + '月' + d.getDate() + '日'));
      bits.push(dayLabel + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()));
    } else {
      bits.push('无计划');
    }
    if (repeat && repeat !== 'none') {
      var opt = repeatOptions(dueAt, lunar).filter(function (o) { return o.value === repeat; })[0];
      var label = opt ? opt.label : D.REPEAT_LABEL[repeat];
      if (extra && extra.repeatCount) label += ' · 共' + extra.repeatCount + '次';
      else if (extra && extra.repeatUntil) {
        var u = D.parseDate(extra.repeatUntil);
        if (u) label += ' · 至' + (u.getMonth() + 1) + '/' + u.getDate();
      }
      bits.push(label);
    }
    return bits.join(' · ');
  }

  /**
   * mountPlan(host, {dueAt, repeat, lunar, repeatUntil, repeatCount, onChange})
   */
  function mountPlan(host, opts) {
    opts = opts || {};
    var state = {
      dueAt: opts.dueAt || null,
      repeat: opts.repeat || 'none',
      lunar: opts.lunar || null,
      repeatUntil: opts.repeatUntil || null,
      repeatCount: typeof opts.repeatCount === 'number' ? opts.repeatCount : null
    };
    var viewMonth = D.parseDate(state.dueAt) || new Date();
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    var calMode = 'due';   /* 'due' | 'until' */

    host.innerHTML =
      '<div class="plan-quick">' +
      '  <button type="button" data-plan="today">今天</button>' +
      '  <button type="button" data-plan="tomorrow">明天</button>' +
      '  <button type="button" data-plan="d2">后天</button>' +
      '  <button type="button" data-plan="nextmonday">下周一</button>' +
      '  <button type="button" data-plan="evening">今晚 20:00</button>' +
      '  <button type="button" data-plan="clear">清除</button>' +
      '</div>' +
      '<div class="plan-row">' +
      '  <button type="button" class="plan-field" data-plan-field="date">选择日期</button>' +
      '  <select class="select select-time" data-plan-input="hour"></select>' +
      '  <select class="select select-time" data-plan-input="minute"></select>' +
      '</div>' +
      '<div class="plan-cal u-hidden" data-plan-cal>' +
      '  <div class="cal-head">' +
      '    <button type="button" data-cal="prev" title="上一个月">\u2039</button>' +
      '    <span class="cal-month" data-cal-month></span>' +
      '    <button type="button" data-cal="next" title="下一个月">\u203A</button>' +
      '    <select class="select cal-year" data-cal-year title="快速选择年份"></select>' +
      '    <button type="button" data-cal="today">今天</button>' +
      '  </div>' +
      '  <div class="cal-dow">' + WEEK.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
      '  <div class="cal-grid" data-cal-grid></div>' +
      '</div>' +
      '<div class="plan-row">' +
      '  <select class="select" data-plan-input="repeat"></select>' +
      '</div>' +
      '<div class="plan-end u-hidden" data-plan-end>' +
      '  <div class="plan-row">' +
      '    <select class="select" data-plan-input="endType">' +
      '      <option value="never">一直重复</option>' +
      '      <option value="until">直到日期结束</option>' +
      '      <option value="count">按次数结束</option>' +
      '    </select>' +
      '  </div>' +
      '  <div class="plan-row u-hidden" data-end-until>' +
      '    <button type="button" class="plan-field" data-plan-field="untilDate">选择结束日期</button>' +
      '  </div>' +
      '  <div class="plan-row u-hidden" data-end-count>' +
      '    <input class="input" type="number" min="2" max="999" step="1" data-plan-input="count" />' +
      '    <span class="plan-end-hint tiny faint">次后结束（含首次）</span>' +
      '  </div>' +
      '</div>' +
      '<div class="plan-sum tiny faint" data-plan-sum></div>';

    var dateField = host.querySelector('[data-plan-field="date"]');
    var untilField = host.querySelector('[data-plan-field="untilDate"]');
    var hourSel = host.querySelector('[data-plan-input="hour"]');
    var minuteSel = host.querySelector('[data-plan-input="minute"]');
    var repeatSel = host.querySelector('[data-plan-input="repeat"]');
    var endType = host.querySelector('[data-plan-input="endType"]');
    var endWrap = host.querySelector('[data-plan-end]');
    var untilWrap = host.querySelector('[data-end-until]');
    var countWrap = host.querySelector('[data-end-count]');
    var countInput = host.querySelector('[data-plan-input="count"]');
    var cal = host.querySelector('[data-plan-cal]');
    var calGrid = host.querySelector('[data-cal-grid]');
    var calMonth = host.querySelector('[data-cal-month]');
    var calYear = host.querySelector('[data-cal-year]');
    var sum = host.querySelector('[data-plan-sum]');

    var thisYear = new Date().getFullYear();
    var yearOpts = [];
    for (var y = thisYear - 80; y <= thisYear + 20; y++) yearOpts.push(y);
    calYear.innerHTML = yearOpts.map(function (y) {
      return '<option value="' + y + '">' + y + ' 年</option>';
    }).join('');

    hourSel.innerHTML = Array.from({ length: 24 }, function (_, h) {
      return '<option value="' + pad2(h) + '">' + pad2(h) + ' 时</option>';
    }).join('');
    minuteSel.innerHTML = Array.from({ length: 60 }, function (_, m) {
      return '<option value="' + pad2(m) + '">' + pad2(m) + ' 分</option>';
    }).join('');

    function label(text) {
      dateField.textContent = text;
      dateField.classList.toggle('on', !!state.dueAt);
    }
    function untilLabel() {
      var u = D.parseDate(state.repeatUntil);
      untilField.textContent = u ? ('结束 ' + u.getFullYear() + '/' + pad2(u.getMonth() + 1) + '/' + pad2(u.getDate())) : '选择结束日期';
      untilField.classList.toggle('on', !!u);
    }

    function renderCal() {
      calMonth.textContent = (viewMonth.getMonth() + 1) + ' 月';
      calYear.value = String(viewMonth.getFullYear());
      var first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
      var days = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
      var lead = first.getDay();
      var today = startOfDay(new Date()).getTime();
      var sel = calMode === 'due'
        ? (D.parseDate(state.dueAt) ? startOfDay(D.parseDate(state.dueAt)).getTime() : null)
        : (D.parseDate(state.repeatUntil) ? startOfDay(D.parseDate(state.repeatUntil)).getTime() : null);
      var html = '';
      for (var i = 0; i < lead; i++) html += '<span class="cal-blank"></span>';
      for (var d = 1; d <= days; d++) {
        var dt = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d);
        var t = startOfDay(dt).getTime();
        var cls = 'cal-day';
        if (t === today) cls += ' today';
        if (sel !== null && t === sel) cls += ' on';
        html += '<button type="button" class="' + cls + '" data-day="' + d + '">' + d + '</button>';
      }
      calGrid.innerHTML = html;
    }

    function refresh(notify) {
      var d = D.parseDate(state.dueAt);
      label(d ? (d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate())) : '选择日期');
      if (d) {
        hourSel.value = pad2(d.getHours());
        minuteSel.value = pad2(d.getMinutes());
      } else {
        hourSel.value = '09';
        minuteSel.value = '00';
      }
      var options = repeatOptions(state.dueAt, state.lunar);
      /* the model keeps yearly + a lunar date; the picker shows them as two choices,
         so map the stored pair back to the option it came from */
      var shown = state.repeat === 'yearly' && state.lunar ? 'lunarYearly' : state.repeat;
      var allowed = options.map(function (o) { return o.value; });
      if (allowed.indexOf(shown) < 0) { shown = 'none'; state.repeat = 'none'; state.lunar = null; }
      repeatSel.innerHTML = options.map(function (o) {
        return '<option value="' + o.value + '"' + (o.value === shown ? ' selected' : '') + '>' + o.label + '</option>';
      }).join('');
      /* end condition only makes sense for a repeating plan */
      var repeating = state.repeat && state.repeat !== 'none';
      endWrap.classList.toggle('u-hidden', !repeating);
      if (!repeating) {
        state.repeatUntil = null;
        state.repeatCount = null;
      }
      var mode = state.repeatCount ? 'count' : (state.repeatUntil ? 'until' : 'never');
      endType.value = mode;
      untilWrap.classList.toggle('u-hidden', mode !== 'until');
      countWrap.classList.toggle('u-hidden', mode !== 'count');
      countInput.value = state.repeatCount || 3;
      untilLabel();
      sum.textContent = planText(state.dueAt, state.repeat, state.lunar, state) +
        (state.dueAt ? '' : ' · 选择日期后可设置每周 / 每月 / 每年');
      if (notify && opts.onChange) opts.onChange(get());
    }

    function get() {
      return {
        dueAt: state.dueAt,
        repeat: state.repeat,
        lunar: state.lunar,
        repeatUntil: state.repeatUntil,
        repeatCount: state.repeatCount
      };
    }

    function setDue(date, time) {
      state.dueAt = combine(toDateInput(date), time || '09:00');
      state.lunar = null;
    }

    function setQuick(kind) {
      var now = new Date();
      var base = startOfDay(now);
      var d = null;
      if (kind === 'today') d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 9, 0);
      else if (kind === 'tomorrow') d = addDays(base, 1);
      else if (kind === 'd2') d = addDays(base, 2);
      else if (kind === 'nextmonday') {
        var delta = (1 - now.getDay() + 7) % 7;
        d = addDays(base, delta === 0 ? 7 : delta);
      } else if (kind === 'evening') {
        d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 20, 0);
        if (d.getTime() <= now.getTime()) d = addDays(d, 1);
      }
      if (kind === 'clear') {
        state.dueAt = null;
        state.repeat = 'none';
        state.lunar = null;
        state.repeatUntil = null;
        state.repeatCount = null;
        cal.classList.add('u-hidden');
        refresh(true);
        return;
      }
      if (!d) return;
      if (kind !== 'today' && kind !== 'evening') d.setHours(9, 0, 0, 0);
      setDue(d, pad2(d.getHours()) + ':' + pad2(d.getMinutes()));
      viewMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      cal.classList.add('u-hidden');
      refresh(true);
    }

    host.addEventListener('click', function (ev) {
      var quick = ev.target.closest('[data-plan]');
      if (quick) { ev.preventDefault(); setQuick(quick.dataset.plan); return; }
      var nav = ev.target.closest('[data-cal]');
      if (nav) {
        ev.preventDefault();
        var act = nav.dataset.cal;
        if (act === 'prev') viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
        else if (act === 'next') viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
        else if (act === 'today') viewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        renderCal();
        return;
      }
      var day = ev.target.closest('[data-day]');
      if (day) {
        ev.preventDefault();
        var picked = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), Number(day.dataset.day));
        if (calMode === 'until') {
          var u = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), 23, 59, 0, 0);
          state.repeatUntil = u.toISOString();
          cal.classList.add('u-hidden');
        } else {
          state.dueAt = combine(toDateInput(picked), hourSel.value + ':' + minuteSel.value);
          state.lunar = null;
          cal.classList.add('u-hidden');
        }
        refresh(true);
        return;
      }
      var field = ev.target.closest('[data-plan-field]');
      if (field) {
        ev.preventDefault();
        var which = field.dataset.planField;
        calMode = which === 'untilDate' ? 'until' : 'due';
        var anchor = D.parseDate(calMode === 'until' ? state.repeatUntil : state.dueAt) || new Date();
        viewMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        renderCal();
        cal.classList.remove('u-hidden');
        return;
      }
    });

    hourSel.addEventListener('change', function () {
      if (!state.dueAt) { setDue(new Date(), hourSel.value + ':' + minuteSel.value); }
      else {
        var d = D.parseDate(state.dueAt);
        state.dueAt = combine(toDateInput(d), hourSel.value + ':' + minuteSel.value);
      }
      refresh(true);
    });
    minuteSel.addEventListener('change', function () {
      if (!state.dueAt) { setDue(new Date(), hourSel.value + ':' + minuteSel.value); }
      else {
        var d = D.parseDate(state.dueAt);
        state.dueAt = combine(toDateInput(d), hourSel.value + ':' + minuteSel.value);
      }
      refresh(true);
    });
    repeatSel.addEventListener('change', function () {
      var v = repeatSel.value;
      if (v === 'lunarYearly') {
        var dd = D.parseDate(state.dueAt);
        var L = window.NeonLunar;
        state.lunar = (dd && L && L.solarToLunar) ? L.solarToLunar(dd) : null;
        state.repeat = state.lunar ? 'yearly' : 'none';
        if (!state.lunar) v = 'none';
      } else {
        state.repeat = v;
        state.lunar = null;
      }
      if (state.repeat === 'none') { state.repeatUntil = null; state.repeatCount = null; }
      refresh(true);
    });
    endType.addEventListener('change', function () {
      var mode = endType.value;
      if (mode === 'never') { state.repeatUntil = null; state.repeatCount = null; }
      else if (mode === 'until') {
        state.repeatCount = null;
        if (!state.repeatUntil) {
          var base = D.parseDate(state.dueAt) || new Date();
          state.repeatUntil = new Date(base.getFullYear(), base.getMonth() + 1, base.getDate(), 23, 59, 0, 0).toISOString();
        }
      } else {
        state.repeatUntil = null;
        if (!state.repeatCount) state.repeatCount = 3;
      }
      refresh(true);
    });
    countInput.addEventListener('input', function () {
      var v = Math.max(2, Math.min(999, Math.floor(Number(countInput.value) || 2)));
      state.repeatCount = v;
      refresh(true);
    });
    calYear.addEventListener('change', function () {
      viewMonth = new Date(Number(calYear.value) || new Date().getFullYear(), viewMonth.getMonth(), 1);
      renderCal();
    });

    refresh(false);
    return {
      get: get,
      set: function (dueAt, repeat, lunar, extra) {
        state.dueAt = dueAt || null;
        state.repeat = repeat || 'none';
        state.lunar = lunar || null;
        state.repeatUntil = (extra && extra.repeatUntil) || null;
        state.repeatCount = (extra && typeof extra.repeatCount === 'number') ? extra.repeatCount : null;
        var anchor = D.parseDate(state.dueAt) || new Date();
        viewMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        refresh(false);
      },
      refresh: function () { refresh(false); }
    };
  }

  window.NeonPlan = {
    mount: mountPlan,
    repeatOptions: repeatOptions,
    planText: planText,
    toDateInput: toDateInput,
    toTimeInput: toTimeInput,
    combine: combine
  };
})();
