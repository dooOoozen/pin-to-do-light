/* Probe only: what does the shipped parser actually make of this pile of surface forms?
   Run it before writing expectations, because guessing the answer and then asserting the
   guess is how a table of 40 cases ends up certifying a bug. */
/* The SAY table prints and the ASSERT table decides; ASSERT exits non-zero on a mismatch. */
'use strict';
const path = require('path');
global.window = globalThis;
const Nlp = require(path.join(__dirname, '../src/shared/nlp.js'));
global.NeonNLP = Nlp;

const NOW = new Date(2026, 8, 24, 10, 0, 0);   /* Thursday, week of Mon 9/21 – Sun 9/27 */
const GROUPS = [{ id: 'g_work', name: '工作 WORK' }];

const SAY = [
  '下周一', '下周二', '下周三', '下周四', '下周五', '下周六', '下周日', '下星期天',
  '本周一', '本周五', '本周日', '这周三', '这周五', '周五', '星期天', '周六',
  '下下周一', '下下周三', '下下下周二',
  '下周二晚上8点', '下周三下午三点半', '明早九点', '今晚', '明晚', '后天中午',
  '明天', '今天', '昨天', '大后天', '下个月3号', '9月30日', '10月1日 15:00',
  '昨天3点', '昨天15点20分', '昨天晚上9点', '昨晚', '前天9时', '大前天8点',
  '上个月5号', '上月5日14时', '下个月3号晚上8点', '下月20号15:30',
  '12/25', '2026年1月5日', '每周一早上9点', '每月15号', '每年农历八月十五',
  '下周', '周', '3点后', '晚上', '工作日下午', '月底前', '国庆第一天',
  '礼拜六', '后天', '周五下午', '周三早上', '下周二 -工作', '明天下午3点',
  '周六晚上七点半', '每周五', '12月31日', '2027年1月1日早上8点'
];

function local(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  const wd = '日一二三四五六'[d.getDay()];
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' 周' + wd +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

SAY.forEach(function (s) {
  let out;
  try {
    out = Nlp.parse(s, { groups: GROUPS, now: NOW });
  } catch (e) {
    console.log('THROW  ' + s + '  ' + e.message);
    return;
  }
  const t = out && out.dueAt ? local(out.dueAt) : '--------';
  const flags = [];
  if (out && out.repeat) flags.push('repeat=' + out.repeat);
  if (out && out.lunar) flags.push('lunar=' + JSON.stringify(out.lunar));
  if (out && out.warning) flags.push('warn=' + out.warning);
  if (out && out.groupId) flags.push('group=' + out.groupId);
  if (out && out.title !== undefined) flags.push('title=' + JSON.stringify(out.title));
  console.log(t + '   ' + s + (flags.length ? '   [' + flags.join(' ') + ']' : ''));
});

/* ---- assertions ---------------------------------------------------------------
   The table above prints; this block decides. Every expected value is absolute and
   derived from NOW (or the case's own reference day), so the run is reproducible. */

const ASSERT = [
  /* relative past days: a stated time is what makes them a due date */
  { say: '昨天3点', want: '2026-09-23 15:00:00' },
  { say: '昨天15点20分', want: '2026-09-23 15:20:00' },
  { say: '昨天下午3点', want: '2026-09-23 15:00:00' },
  { say: '昨天晚上9点', want: '2026-09-23 21:00:00' },
  { say: '昨晚', want: '2026-09-23 20:00:00' },
  { say: '昨日9点', want: '2026-09-23 09:00:00' },
  { say: '前天9时', want: '2026-09-22 09:00:00' },
  { say: '前天15时', want: '2026-09-22 15:00:00' },
  { say: '大前天8点', want: '2026-09-21 08:00:00' },
  { say: '昨天3点交报告', want: '2026-09-23 15:00:00', title: '交报告' },
  /* past with no time stated stays dateless, as tools/eval.js asserts for 昨天 */
  { say: '昨天', want: null },
  { say: '前天', want: null },
  { say: '大前天', want: null },
  /* relative months */
  { say: '上个月5号', want: '2026-08-05 09:00:00' },
  { say: '上月5日14时', want: '2026-08-05 14:00:00' },
  { say: '上个月5号交报告', want: '2026-08-05 09:00:00', title: '交报告' },
  { say: '下个月3号', want: '2026-10-03 09:00:00' },
  { say: '下个月3号晚上8点', want: '2026-10-03 20:00:00' },
  { say: '下月20号15:30', want: '2026-10-20 15:30:00' },
  { say: '上个月', want: null },
  { say: '下个月', want: null },
  /* month length and year rollover, on reference days that exercise them */
  { say: '上个月31号', now: new Date(2026, 2, 15, 10, 0, 0), want: '2026-02-28 09:00:00' },
  { say: '下个月31号', now: new Date(2026, 2, 15, 10, 0, 0), want: '2026-04-30 09:00:00' },
  { say: '上个月5号', now: new Date(2026, 0, 10, 10, 0, 0), want: '2025-12-05 09:00:00' },
  { say: '下个月5号', now: new Date(2026, 11, 10, 10, 0, 0), want: '2027-01-05 09:00:00' },
  /* the phrases that already worked, re-pinned so the fix cannot take them away */
  { say: '今天', want: '2026-09-24 09:00:00' },
  { say: '明天', want: '2026-09-25 09:00:00' },
  { say: '今晚', want: '2026-09-24 20:00:00' },
  { say: '明晚', want: '2026-09-25 20:00:00' },
  { say: '后天中午', want: '2026-09-26 12:00:00' },
  { say: '大后天', want: '2026-09-27 09:00:00' },
  { say: '下周二晚上8点', want: '2026-09-29 20:00:00' },
  { say: '下周三下午三点半', want: '2026-09-30 15:30:00' },
  { say: '明天下午3点', want: '2026-09-25 15:00:00' },
  { say: '周六晚上七点半', want: '2026-09-26 19:30:00' },
  { say: '周五下午', want: '2026-09-25 14:00:00' },
  { say: '9月30日', want: '2026-09-30 09:00:00' },
  { say: '10月1日 15:00', want: '2026-10-01 15:00:00' },
  { say: '2027年1月1日早上8点', want: '2027-01-01 08:00:00' },
  { say: '每月15号', want: '2026-10-15 09:00:00' },
  { say: '每周一早上9点', want: '2026-09-28 09:00:00' },
  { say: '下周二 -工作', want: '2026-09-29 09:00:00' },
  /* still not claimed */
  { say: '12/25', want: null },
  { say: '下周', want: null },
  { say: '月底前', want: null },
  { say: '国庆第一天', want: null }
];

function stamp(value) {
  const d = value instanceof Date ? value : new Date(value);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
    p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

let failed = 0;
ASSERT.forEach(function (a) {
  const out = Nlp.parse(a.say, { groups: GROUPS, now: a.now || NOW });
  const got = out.dueAt ? stamp(out.dueAt) : null;
  const errs = [];
  if (got !== a.want) errs.push('期望 ' + a.want + ' 得到 ' + got);
  if (out.dueAt && new Date(out.dueAt).getSeconds() !== 0) errs.push('秒未归零');
  if (a.title && out.title !== a.title) errs.push('标题期望 ' + JSON.stringify(a.title) + ' 得到 ' + JSON.stringify(out.title));
  if (errs.length) { failed++; console.log('FAIL  ' + (a.now ? stamp(a.now) + ' ' : '') + a.say + '  ' + errs.join('；')); }
});
console.log('\n断言 ' + (ASSERT.length - failed) + '/' + ASSERT.length + (failed ? ' —— 有失败' : ''));
process.exitCode = failed ? 1 : 0;

