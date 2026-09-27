/* Probe only: what does the shipped parser actually make of this pile of surface forms?
   Run it before writing expectations, because guessing the answer and then asserting the
   guess is how a table of 40 cases ends up certifying a bug. */
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
