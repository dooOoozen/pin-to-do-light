/**
 * DASHBOARD 1971 — quick add text parser (UMD).
 * Turns phrases like
 *   "明天五点吃火锅"
 *   "每年农历五月十日小白生日"
 *   "每月5号发工资"
 *   "明天五点吃火锅 -日常"
 * into a task draft (title / due / repeat / group), removing the recognised
 * tokens from the title. Uses NeonData (for group matching) and NeonLunar.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'), require('./lunar.js'));
  else root.NeonNLP = factory(root.NeonData, root.NeonLunar);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D, Lunar) {
  'use strict';

  var CN_DIGITS = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  var NUM_NC = '(?:[0-9]{1,4}|[零〇一二两三四五六七八九十廿]{1,3})';
  var NUM = '(' + NUM_NC + ')';

  function cnToNum(s) {
    if (s === undefined || s === null) return NaN;
    s = String(s).trim();
    if (!s) return NaN;
    if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
    if (s.indexOf('廿') === 0) {
      var rest = s.slice(1);
      return 20 + (rest ? (CN_DIGITS[rest] !== undefined ? CN_DIGITS[rest] : 0) : 0);
    }
    if (s === '十') return 10;
    var m = s.match(/^十([一二三四五六七八九])$/);
    if (m) return 10 + CN_DIGITS[m[1]];
    m = s.match(/^([一二三四五六七八九])十([一二三四五六七八九])?$/);
    if (m) return CN_DIGITS[m[1]] * 10 + (m[2] ? CN_DIGITS[m[2]] : 0);
    if (s.length === 1) return CN_DIGITS[s] !== undefined ? CN_DIGITS[s] : NaN;
    var sum = 0;
    for (var i = 0; i < s.length; i++) {
      if (CN_DIGITS[s[i]] === undefined) return NaN;
      sum = sum * 10 + CN_DIGITS[s[i]];
    }
    return sum;
  }

  function normalize(text) {
    return String(text || '')
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
      .replace(/[：]/g, ':')
      .replace(/[　]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findGroup(groups, token) {
    if (!token || !groups) return null;
    var want = token.replace(/\s+/g, '').toLowerCase();
    var best = null;
    groups.forEach(function (g) {
      var name = String(g.name || '');
      var cn = name.replace(/[A-Za-z0-9\s\-—_/]/g, '');
      var full = name.replace(/\s+/g, '').toLowerCase();
      if (full === want || cn.toLowerCase() === want) { best = g; return; }
      if (!best && (full.indexOf(want) >= 0 || (cn && want.indexOf(cn.toLowerCase()) >= 0))) best = g;
    });
    return best;
  }

  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }

  /**
   * parse(text, {groups, now}) → {title, dueAt, repeat, lunar, groupId, groupName, matched, warning}
   */
  function parse(text, opts) {
    opts = opts || {};
    var groups = opts.groups || [];
    var now = opts.now ? new Date(opts.now) : new Date();
    var work = normalize(text);

    var out = {
      title: '', dueAt: null, repeat: 'none', lunar: null,
      groupId: null, groupName: '', matched: [], warning: '',
      lunarRequested: false, hasDate: false, hasTime: false,
      month: null, day: null, year: null, dow: null, weekNext: 0,
      relative: null, evening: false, hour: null, minute: null, hourExplicit: false
    };

    function cut(re) {
      var m = work.match(re);
      if (!m) return null;
      work = work.replace(m[0], ' ');
      out.matched.push(String(m[0]).trim());
      return m;
    }

    /* ---- group suffix:  ... -日常  /  ... #工作 ---- */
    var gm = work.match(/\s*[-–—－#＃]\s*([^\s#＃\-–—]{1,16})\s*$/);
    if (gm) {
      var token = gm[1].trim();
      var found = findGroup(groups, token);
      if (found) {
        out.groupId = found.id;
        out.groupName = found.name;
        work = work.slice(0, gm.index);
      } else {
        out.warning = '未找到分组「' + token + '」，已留在标题里';
      }
    }

    /* ---- lunar flag ---- */
    if (/农历|阴历/.test(work)) {
      out.lunarRequested = true;
      work = work.replace(/农历|阴历/g, ' ');
    }

    /* ---- repeats (must run before plain dates) ---- */
    var m;
    m = cut(new RegExp('(?:每|逢)(?:个)?(?:周|星期|礼拜)\\s*([一二三四五六日天1-7])'));
    if (m) { out.repeat = 'weekly'; out.dow = dowFromCn(m[1]); }

    m = cut(new RegExp('(?:每|逢)(?:个)?月\\s*' + NUM + '\\s*[日号]?'));
    if (m) { out.repeat = 'monthly'; out.day = cnToNum(m[1]); }

    m = cut(new RegExp('(?:每|逢)年\\s*' + NUM + '\\s*月\\s*' + NUM + '\\s*[日号]?'));
    if (m) { out.repeat = 'yearly'; out.month = cnToNum(m[1]); out.day = cnToNum(m[2]); }

    m = cut(/每(?:天|日)/);
    if (m) out.repeat = 'daily';

    m = cut(/(?:每|逢)年/);
    if (m && out.repeat === 'none') out.repeat = 'yearly';

    /* ---- relative days ---- */
    if (cut(/大后天/)) out.relative = 'd3';
    else if (cut(/后天/)) out.relative = 'd2';
    else if (cut(/明天|明日|明晚/)) { out.relative = 'd1'; if (/明晚/.test(String(out.matched[out.matched.length - 1]))) out.evening = true; }
    else if (cut(/今天|今日|今晚|今儿/)) { out.relative = 'd0'; if (/今晚/.test(String(out.matched[out.matched.length - 1]))) out.evening = true; }

    /* ---- absolute date: 5月10日 / 2026年5月10日 / 25号 ---- */
    m = cut(new RegExp('(?:(' + NUM_NC + ')\\s*年\\s*)?(' + NUM_NC + ')\\s*月\\s*(' + NUM_NC + ')\\s*[日号]'));
    if (m) {
      if (m[1]) out.year = cnToNum(m[1]);
      out.month = cnToNum(m[2]);
      out.day = cnToNum(m[3]);
    }
    if (!out.month || !out.day) {
      m = cut(new RegExp('(?:(' + NUM_NC + ')\\s*年\\s*)?(' + NUM_NC + ')\\s*[号日](?![\\u4e00-\\u9fa5])'));
      if (m) {
        if (m[1]) out.year = cnToNum(m[1]);
        out.day = cnToNum(m[2]);
        if (out.repeat === 'monthly') out.month = null; /* day-of-month repeat */
      }
    }

    /* ---- weekday (non repeating): 下周三 ---- */
    m = cut(/(下{1,2}|本|这)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天1-7])/);
    if (m) {
      out.dow = cnToNum(m[2].replace('天', '7').replace('日', '7'));
      out.weekNext = m[1] ? (m[1].length >= 2 ? 2 : 1) : 0;
    }

    /* ---- time ---- */
    m = cut(new RegExp('(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里|晚|夜里)?\\s*(' + NUM_NC + ')\\s*[点时：:]\\s*(半|' + NUM_NC + '\\s*分?)?'));
    if (m) {
      out.hour = cnToNum(m[2]);
      out.minute = !m[3] ? 0 : (/半/.test(m[3]) ? 30 : cnToNum(String(m[3]).replace(/[分\s]/g, '')));
      var mod = m[1] || '';
      out.hourExplicit = !!mod;
      if (/凌晨/.test(mod)) out.hour = out.hour % 12;
      else if (/早上|早晨|上午/.test(mod)) out.hour = out.hour % 12 === 0 ? 12 : out.hour % 12;
      else if (/中午/.test(mod)) out.hour = out.hour >= 11 && out.hour <= 13 ? out.hour : 12;
      else if (/下午|傍晚|晚上|夜里|晚/.test(mod)) { out.hour = out.hour % 12 + 12; out.evening = true; }
      out.hasTime = true;
    } else {
      m = cut(/([0-9]{1,2}):([0-9]{2})/);
      if (m) { out.hour = parseInt(m[1], 10); out.minute = parseInt(m[2], 10); out.hasTime = true; out.hourExplicit = true; }
    }
    if (!out.hasTime) {
      if (out.evening) { out.hour = 20; out.minute = 0; }
    }
    /* evening context (今晚 / 明晚 / 晚上) promotes bare hours to the evening */
    if (out.hasTime && !out.hourExplicit && out.evening && out.hour < 12) out.hour += 12;
    /* bare 1..6 o'clock reads as afternoon in everyday Chinese */
    if (out.hasTime && !out.hourExplicit && !out.evening && out.hour >= 1 && out.hour <= 6) out.hour += 12;
    /* bare 1..6 o'clock reads as afternoon in everyday Chinese */
    if (out.hasTime && !out.hourExplicit && out.hour >= 1 && out.hour <= 6) out.hour += 12;

    /* ---- compose the date ---- */
    var date = null;
    if (out.year && out.month && out.day) {
      date = new Date(out.year, out.month - 1, out.day);
      out.hasDate = true;
    } else if (out.month && out.day) {
      if (out.lunarRequested) {
        date = Lunar.nextLunarOccurrence(out.month, out.day, startOfDay(now));
        if (!date) out.warning = '农历日期超出可换算范围';
        else out.lunar = { month: out.month, day: out.day };
      } else {
        date = new Date(now.getFullYear(), out.month - 1, out.day);
        if (startOfDay(date) < startOfDay(now)) date.setFullYear(now.getFullYear() + 1);
      }
      out.hasDate = true;
    } else if (out.dow !== null && !isNaN(out.dow)) {
      var delta = (out.dow - now.getDay() + 7) % 7;
      date = addDays(now, delta + out.weekNext * 7);
      out.hasDate = true;
      out.weekdayOnly = true;
    } else if (out.relative) {
      date = addDays(now, parseInt(out.relative.replace('d', ''), 10));
      out.hasDate = true;
    }

    /* repeats that carry their own day */
    if (!date && out.repeat === 'monthly' && out.day) {
      date = new Date(now.getFullYear(), now.getMonth(), out.day);
      if (startOfDay(date) < startOfDay(now)) date = new Date(now.getFullYear(), now.getMonth() + 1, out.day);
    }
    if (!date && out.repeat === 'yearly' && out.month && out.day) {
      if (out.lunarRequested) {
        date = Lunar.nextLunarOccurrence(out.month, out.day, startOfDay(now));
        if (date) out.lunar = { month: out.month, day: out.day };
      } else {
        date = new Date(now.getFullYear(), out.month - 1, out.day);
        if (startOfDay(date) < startOfDay(now)) date.setFullYear(now.getFullYear() + 1);
      }
    }
    if (!date && out.repeat === 'weekly' && out.dow !== null && !isNaN(out.dow)) {
      var d2 = (out.dow - now.getDay() + 7) % 7;
      date = addDays(now, d2 === 0 ? 7 : d2);
    }

    /* time only: today, or tomorrow when it already passed */
    if (!date && out.hasTime) {
      date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var probe = new Date(date.getFullYear(), date.getMonth(), date.getDate(), out.hour, out.minute || 0);
      if (probe.getTime() <= now.getTime()) date = addDays(date, 1);
    }
    if (!date && out.repeat && out.repeat !== 'none') date = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (date) {
      var hh = out.hasTime ? out.hour : (out.evening ? 20 : 9);
      var mm = out.hasTime ? (out.minute || 0) : 0;
      date.setHours(hh, mm, 0, 0);
      /* a bare weekday that already passed rolls to the next week */
      if (out.weekdayOnly && date.getTime() <= now.getTime()) date = addDays(date, 7);
      out.dueAt = date.toISOString();
    }

    /* ---- title ---- */
    var title = work
      .replace(/\s+/g, ' ')
      .replace(/^[\s，,。.、:：\-–—]+/, '')
      .replace(/[\s，,。.、:：\-–—]+$/, '')
      .trim();
    out.title = title || normalize(text).trim() || '新任务';
    return out;
  }

  function dowFromCn(ch) {
    var map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
    return map[ch] !== undefined ? map[ch] : parseInt(ch, 10);
  }

  /* short human summary for the UI preview */
  function describe(parsed) {
    var bits = [];
    if (parsed.dueAt) {
      var d = new Date(parsed.dueAt);
      bits.push((d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
        String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'));
    }
    if (parsed.lunar) bits.push('农历' + parsed.lunar.month + '月' + parsed.lunar.day + '日');
    if (parsed.repeat && parsed.repeat !== 'none') {
      var label = { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' }[parsed.repeat] || parsed.repeat;
      bits.push(label);
    }
    if (parsed.groupName) bits.push(parsed.groupName);
    return bits.join(' · ');
  }

  return { parse: parse, describe: describe, cnToNum: cnToNum };
});
