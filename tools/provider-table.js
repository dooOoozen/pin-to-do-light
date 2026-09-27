/* What does the agent cost on each kind of endpoint? Same suites, same code, one knob.

   The mock can answer in three shapes, and every real provider is one of them:
     native   — an OpenAI-style tool_calls array (what the API contract promises)
     dialect  — the call written into the prose in the model's own markup (what Qwen behind the
                Hugging Face router actually does)
     prose    — no call at all (what a local endpoint does when it will not honour tool_choice,
                e.g. Ollama's /v1 with a model that has no tool support)

   Nothing here needs a key or a network: it spawns tools/mock-llm.js on its own ports and
   points tools/eval.js at each one through MOCK_BASE, then reads the numbers back out of the
   history file the eval writes. Against a real endpoint the same table is one line:

     node tools/eval.js --live http://localhost:11434/v1 llama3

     node tools/provider-table.js
*/
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const MODES = [
  { key: 'native', env: '', label: '原生 tool_calls' },
  { key: 'dialect', env: 'dialect', label: '正文里的方言调用' },
  { key: 'prose', env: 'prose', label: '纯散文（不会调用工具）' }
];

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'providers-'));

function waitUp(port) {
  const url = 'http://127.0.0.1:' + port + '/models';
  for (let i = 0; i < 60; i++) {
    try {
      const r = spawnSync(process.execPath, ['-e',
        'fetch(' + JSON.stringify(url) + ').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))'],
        { timeout: 2000 });
      if (r.status === 0) return true;
    } catch (e) { /* not up yet */ }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }
  return false;
}

const rows = [];
for (const m of MODES) {
  const port = 8791 + MODES.indexOf(m);
  const hist = path.join(TMP, m.key + '.jsonl');
  const mock = spawn(process.execPath, [path.join(__dirname, 'mock-llm.js'), String(port)], {
    env: Object.assign({}, process.env, m.env ? { MOCK_NO_TOOLS: m.env } : {}),
    stdio: 'ignore'
  });
  if (!waitUp(port)) { console.error('mock 起不来（port ' + port + '）'); mock.kill(); process.exit(1); }
  const run = spawnSync(process.execPath, [path.join(__dirname, 'eval.js'), '--json', hist], {
    env: Object.assign({}, process.env, { MOCK_BASE: 'http://127.0.0.1:' + port + '/v1' }),
    encoding: 'utf8'
  });
  mock.kill();
  let rec = null;
  try {
    const lines = fs.readFileSync(hist, 'utf8').split('\n').filter(Boolean);
    rec = JSON.parse(lines[lines.length - 1]);
  } catch (e) {
    console.error('没读到 ' + hist + '\n' + (run.stdout || '') + (run.stderr || ''));
    process.exit(1);
  }
  const suites = {};
  (rec.suites || []).forEach((s) => { suites[s.suite] = s; });
  const net = (rec.net || []).filter((x) => x.suite !== 'A');
  rows.push({
    label: m.label,
    pass: rec.pass + '/' + rec.total,
    a: suites.A ? suites.A.pass + '/' + suites.A.total : '-',
    b: suites.B ? suites.B.pass + '/' + suites.B.total : '-',
    c: suites.C ? suites.C.pass + '/' + suites.C.total : '-',
    d: suites.D ? suites.D.pass + '/' + suites.D.total : '-',
    firstTry: net.reduce((x, s) => x + s.firstTry, 0) + '/' + net.reduce((x, s) => x + s.samples, 0),
    requests: net.reduce((x, s) => x + s.requests, 0),
    tokens: net.reduce((x, s) => x + s.tokens, 0),
    p95: net.length ? Math.max.apply(null, net.map((s) => s.p95 || 0)) : 0
  });
}

const head = ['端点形状', 'A 解析', 'B 循环', 'C 落库', 'D 防守', '合计', '一次到位', '往返', 'tokens'];
const body = rows.map((r) => [r.label, r.a, r.b, r.c, r.d, r.pass, r.firstTry, r.requests, r.tokens]);
const w = head.map((h, i) => body.reduce((a, r) => Math.max(a, String(r[i]).length), String(h).length));
const cell = (v, i) => String(v) + ' '.repeat(Math.max(0, w[i] - String(v).length));
console.log('\n' + head.map((h, i) => cell(h, i) + '  ').join(''));
body.forEach((r) => console.log(r.map((v, i) => cell(v, i) + '  ').join('')));
console.log('\n延迟列省略了：三个模式跑在同一台机器的同一个 mock 上，p95 ' +
  Math.max.apply(null, rows.map((r) => r.p95)) + 'ms 只反映本进程，真实延迟用 --live。\n');
console.log('读法：方言一行说明翻译层值多少（合计不掉，一次到位归零）；散文一行说明它值多少——');
console.log('新建路径由本地解析接住，改已有任务的路径没有可接的东西，那部分是端点能力问题，不是提示词问题。');
