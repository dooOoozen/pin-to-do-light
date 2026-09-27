/* Replay one logged agent turn, offline.

   The host appends every trace entry to %APPDATA%\\dev.qoder.pintauri\\agent-trace.jsonl, so a
   turn that misbehaved once three days ago is still on disk: the sentence, the model, the
   base, each stage with its ms and tokens, what was resolved and what was written. This tool
   takes one of those turns and runs the same sentence through the same code path again, then
   prints the two stage sequences side by side.

   What it does not do is restore the task list. The trace records how many tasks were in the
   context, not what they were — that lives in the user's data file, and copying it next to
   the log would put the user's schedule in a diagnostic file nobody reads. So a replay runs
   against an empty board and says so; the comparison it is good for is "did the model answer
   the same way twice", which is exactly the question a flaky turn raises.

     node tools/replay.js                     # the last 15 turns
     node tools/replay.js 12                  # replay turn 12 against the mock
     node tools/replay.js 12 --base http://127.0.0.1:8787/v1 --model mock
*/
'use strict';

const path = require('path');
const fs = require('fs');

function tracePath() {
  const base = process.env.APPDATA || process.env.HOME;
  return path.join(base, 'dev.qoder.pintauri', 'agent-trace.jsonl');
}

function readTurns() {
  const file = tracePath();
  if (!fs.existsSync(file)) {
    console.error('没有 trace 文件：' + file + '\n先在应用里用 ✨ 跑一轮（需要新版 exe）。');
    process.exit(1);
  }
  const turns = new Map();
  fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).forEach(function (line) {
    let e;
    try { e = JSON.parse(line.replace(/^\[pid:\d+\]/, '')); } catch (err) { return; }
    if (!e || !e.turn) return;
    if (!turns.has(e.turn)) turns.set(e.turn, []);
    turns.get(e.turn).push(e);
  });
  return turns;
}

function describe(entries) {
  const req = entries.find((e) => e.stage === 'request') || {};
  const end = entries.filter((e) => ['resolved', 'local-fallback', 'error', 'empty-input'].indexOf(e.stage) >= 0).pop() || {};
  const tokens = entries.filter((e) => e.stage === 'tools').reduce((a, e) => a + (e.tokens || 0), 0);
  return {
    turn: entries[0].turn, at: req.at, say: req.say || '(无记录)',
    model: req.model || '?', base: req.base || '?', tasks: req.tasks || 0,
    kind: end.kind || '-', tokens: tokens, ms: end.ms || 0,
    stages: entries.map((e) => e.stage + (typeof e.ms === 'number' ? '(' + e.ms + ')' : ''))
  };
}

const argv = process.argv.slice(2);
const which = argv.find((a) => /^\d+$/.test(a));
const turns = readTurns();
const all = [...turns.values()].map(describe).sort((a, b) => a.turn - b.turn);

if (!which) {
  console.log('文件 ' + tracePath() + ' · ' + all.length + ' 轮\n');
  all.slice(-15).forEach(function (t) {
    console.log('  ' + String(t.turn).padStart(4) + '  ' + new Date(t.at).toLocaleString() +
      '  ' + (t.ms + 'ms').padStart(8) + '  ' + String(t.tokens).padStart(6) + ' tok  ' +
      t.kind.padEnd(9) + ' ' + String(t.say).slice(0, 46));
  });
  console.log('\nnode tools/replay.js <轮号> 重放其中一轮');
  process.exit(0);
}

const want = all.filter((t) => t.turn === Number(which))[0];
if (!want) { console.error('没有第 ' + which + ' 轮'); process.exit(1); }
console.log('原轮 ' + want.turn + ' · ' + new Date(want.at).toLocaleString() + ' · ' + want.model +
  ' · 上下文含 ' + want.tasks + ' 个任务\n  句子：' + want.say + '\n  阶段：' + want.stages.join(' > ') +
  '\n  结果：' + want.kind + ' · ' + want.ms + 'ms · ' + want.tokens + ' tokens\n');

const bi = argv.indexOf('--base');
const mi = argv.indexOf('--model');
const BASE = bi >= 0 ? argv[bi + 1] : 'http://127.0.0.1:8787/v1';
const MODEL = mi >= 0 ? argv[mi + 1] : 'mock';

global.window = globalThis;
require(path.join(__dirname, '../src/shared/lunar.js'));
require(path.join(__dirname, '../src/shared/nlp.js'));
global.NeonNLP = global.window.NeonNLP;
const D = require(path.join(__dirname, '../src/shared/data.js'));

const store = D.defaultState();
store.settings.ai = { on: true, base: BASE, model: MODEL };
/* agent.js captures the API object once, at load — so it has to exist as an object before
   the require, and be filled in place afterwards. Assigning a fresh object later is the same
   trap that `Object.assign(global.API, bridge(store))` exists for in tools/eval.js. */
global.API = {};
require(path.join(__dirname, '../src/agent.js'));
const Agent = global.window.Agent || global.Agent;
Object.assign(global.API, {
  aiChat: async function (base, model, body) {
    const res = await fetch(base.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer replay' },
      body: JSON.stringify(body)
    });
    return await res.text();
  },
  aiModels: async function (base) {
    const res = await fetch(base.replace(/\/+$/, '') + '/models');
    return await res.text();
  },
  aiKey: async function () { return { saved: false, hint: '' }; },
  aiTrace: function () { return 0; },
  bootNote: function () { return Promise.resolve(); },
  op: function (o) { return Promise.resolve(D.applyOp(store, o)); },
  getState: function () { return Promise.resolve(store); }
});

console.log('重放 → ' + BASE + ' · ' + MODEL + '（空任务板，见文件头说明）\n');
Agent.run(want.say, store, { now: new Date(want.at).toISOString() }).then(function (r) {
  const mine = Agent.dump().filter((e) => e.turn === Agent.turnOf());
  const after = describe(mine.length ? mine : [{ turn: 0, stage: 'nothing-logged' }]);
  console.log('  阶段：' + after.stages.join(' > '));
  console.log('  结果：' + r.kind + ' · 草稿 ' + (r.drafts || []).length + ' 条 · 改动 ' + (r.updates || []).length + ' 条');
  /* ms is not part of the comparison: the point is whether the same sentence walked the same
     path — nudge or no nudge, dialect or native, resolved or refused */
  const bare = (list) => list.map((x) => x.replace(/\(\d+\)/, '')).join('>');
  const same = bare(after.stages) === bare(want.stages);
  console.log('\n' + (same ? '一致：两次走出同样的阶段序列' : '不一致：这就是要看的差别') +
    '\n  原：' + want.stages.join(' > ') + '\n  新：' + after.stages.join(' > '));
  process.exitCode = 0;
}).catch(function (e) {
  console.error('重放失败：' + (e && e.message || e) + '\n（mock 没起？node tools/mock-llm.js 8787）');
  process.exitCode = 1;
});
