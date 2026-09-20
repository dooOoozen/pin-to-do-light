/**
 * DASHBOARD 1971 — Chinese lunar calendar helper (UMD).
 * Uses the classic compact lunar table (1900–2100) to convert between the
 * lunar and Gregorian calendars. Verified against known Spring Festival /
 * Mid-Autumn / Dragon-Boat dates in the self test.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NeonLunar = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LUNAR_INFO = [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
    0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
    0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
    0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
    0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, // 1970-1979
    0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
    0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
    0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
    0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
    0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
    0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
    0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
    0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
    0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
    0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
    0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
    0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090-2099
    0x0d520                                                                                    // 2100
  ];

  var BASE_YEAR = 1900;
  var BASE_DATE = Date.UTC(1900, 0, 31); /* lunar 1900-01-01 */

  function yearInfo(y) {
    var info = LUNAR_INFO[y - BASE_YEAR];
    if (info === undefined) return null;
    return info;
  }

  function leapMonth(y) {
    var info = yearInfo(y);
    return info === null ? 0 : (info & 0xf);
  }

  function leapDays(y) {
    if (!leapMonth(y)) return 0;
    return (yearInfo(y) & 0x10000) ? 30 : 29;
  }

  function monthDays(y, m) {
    var info = yearInfo(y);
    if (info === null) return 30;
    return (info & (0x10000 >> m)) ? 30 : 29;
  }

  function yearDays(y) {
    var info = yearInfo(y);
    if (info === null) return 354;
    var sum = 348; /* 12 * 29 */
    for (var i = 0x8000; i > 0x8; i >>= 1) sum += (info & i) ? 1 : 0;
    return sum + leapDays(y);
  }

  /* lunar → gregorian; returns a Date (local midnight) or null when out of range.
     Month numbers address the regular months; a leap month (闰月) is inserted after
     its regular month, so months after it shift by the leap length. */
  function lunarToSolar(y, m, d) {
    if (!yearInfo(y) || m < 1 || m > 12 || d < 1 || d > 30) return null;
    if (d > monthDays(y, m)) return null; /* day does not exist in that lunar month */
    var offset = 0;
    for (var i = BASE_YEAR; i < y; i++) offset += yearDays(i);
    var leap = leapMonth(y);
    for (var mm = 1; mm < m; mm++) {
      offset += monthDays(y, mm);
      if (mm === leap) offset += leapDays(y);
    }
    offset += d - 1;
    var date = new Date(BASE_DATE + offset * 86400000);
    if (isNaN(date.getTime())) return null;
    return date;
  }

  /* gregorian → lunar {year, month, day, isLeap} */
  function solarToLunar(date) {
    var d0 = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    var offset = Math.floor((d0 - BASE_DATE) / 86400000);
    if (offset < 0) return null;
    var y = BASE_YEAR;
    while (y <= 2100) {
      var yd = yearDays(y);
      if (offset < yd) break;
      offset -= yd;
      y++;
    }
    if (y > 2100) return null;
    var leap = leapMonth(y);
    var m = 1;
    var isLeap = false;
    while (m <= 12) {
      var dm = monthDays(y, m);
      if (offset < dm) break;
      offset -= dm;
      if (leap && m === leap) {
        var ld = leapDays(y);
        if (offset < ld) { isLeap = true; break; }
        offset -= ld;
      }
      m++;
    }
    return { year: y, month: m, day: offset + 1, isLeap: isLeap };
  }

  /* the next date (>= from) that has the given lunar month/day.
     When a month has no such day (e.g. 三十 in a 29-day month) the last day is used. */
  function nextLunarOccurrence(month, day, from) {
    var base = from || new Date();
    var startYear = base.getFullYear() - 1;
    for (var y = startYear; y <= startYear + 3; y++) {
      var info = yearInfo(y);
      if (!info) continue;
      var maxDay = monthDays(y, month);
      var useDay = Math.min(day, maxDay);
      var date = lunarToSolar(y, month, useDay);
      if (!date) continue;
      var end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
      if (end.getTime() >= base.getTime()) return date;
    }
    return null;
  }

  /* 七月 / 廿六 — the reading people recognise on a birthday reminder */
  var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  function cnMonth(n) {
    if (n >= 1 && n <= 10) return CN[n];
    if (n === 11) return '十一';
    if (n === 12) return '十二';
    return String(n);
  }
  function cnDay(n) {
    if (n >= 1 && n <= 10) return '初' + CN[n];
    if (n > 10 && n < 20) return '十' + CN[n - 10];
    if (n === 20) return '二十';
    if (n > 20 && n < 30) return '廿' + CN[n - 20];
    if (n === 30) return '三十';
    return String(n);
  }
  function lunarName(month, day, isLeap) {
    return (isLeap ? '闰' : '') + cnMonth(month) + '月' + cnDay(day);
  }

  function available(y) {
    return !!yearInfo(y);
  }

  return {
    lunarToSolar: lunarToSolar,
    lunarName: lunarName,
    cnDay: cnDay,
    solarToLunar: solarToLunar,
    nextLunarOccurrence: nextLunarOccurrence,
    leapMonth: leapMonth,
    monthDays: monthDays,
    available: available,
    minYear: BASE_YEAR,
    maxYear: 2100
  };
});
