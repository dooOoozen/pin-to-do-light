/* Headless reducer check — runs in plain node, no app instance needed:
     node tools/data-check.js
   Covers the settings and colour paths this repo keeps breaking in the renderer: normalize's
   rebuild of unknown/legacy keys, the motion whitelist, and what paint() does to a group colour
   at night (hue must survive; only brightness and saturation may move). */
const D = require('../src/shared/data.js');

let fails = 0;
function ok(cond, label, extra) {
  if (!cond) { fails++; console.log('FAIL ' + label + (extra == null ? '' : '  [' + extra + ']')); }
  else console.log('pass ' + label);
}

function hueOf(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return NaN;
  const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return -1;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const base = {
  groups: [{ id: 'g1', name: '工作', color: 'slate', order: 0 },
           { id: 'g2', name: '自定义', color: '#7fb2d8', order: 1 }],
  todos: [{ id: 't1', title: '示例', groupId: 'g1', done: false }],
  settings: { activeGroupId: 'g1' },
  timeEntries: [{ todoId: 't1', start: new Date().toISOString(), end: new Date().toISOString(), ms: 1000 }]
};

/* --- normalize --- */
let s = D.normalize(JSON.parse(JSON.stringify(base)));
ok(s.settings.runMotion === 'pulse', 'runMotion defaults to pulse', s.settings.runMotion);
ok(s.settings.roundCorners === true, 'roundCorners defaults on');
ok(!('groupPalette' in s.settings), 'legacy groupPalette is gone', JSON.stringify(Object.keys(s.settings)));

s = D.normalize({ ...JSON.parse(JSON.stringify(base)), settings: { activeGroupId: 'g1', runMotion: 'stripe' } });
ok(s.settings.runMotion === 'pulse', 'removed motion falls back', s.settings.runMotion);

s = D.normalize({ ...JSON.parse(JSON.stringify(base)), settings: { activeGroupId: 'g1', runMotion: 'halo' } });
ok(s.settings.runMotion === 'halo', 'new motion kept', s.settings.runMotion);

/* orphan time entries: the residue reports were entries surviving the death of their todo */
s = D.normalize({ ...JSON.parse(JSON.stringify(base)), timeEntries: [
  { todoId: 'gone', start: new Date().toISOString(), end: new Date().toISOString(), ms: 5 },
  { todoId: 't1', start: new Date().toISOString(), end: new Date().toISOString(), ms: 5 }] });
ok(s.timeEntries.length === 1 && s.timeEntries[0].todoId === 't1', 'orphan entries pruned', s.timeEntries.length);

/* --- paint: hue-preserving at night --- */
D.setTheme && D.setTheme('ink', '#b23a2f');
const day = D.paint('#7fb2d8'), night = D.paint('#7fb2d8');
console.log('  paint slate day/night: ' + day + ' / ' + night);
const keys = ['sage', 'vermillion', 'honey', 'brick', 'forest', 'slate', 'teal', 'plum', 'ochre'];
const drift = keys.map((k) => {
  D.setTheme && D.setTheme('paper', '#b23a2f');
  const a = D.paint(k);
  D.setTheme && D.setTheme('ink', '#b23a2f');
  const b = D.paint(k);
  const ha = hueOf(a), hb = hueOf(b);
  return { k, a, b, d: (ha >= 0 && hb >= 0) ? Math.abs(ha - hb) : 0 };
});
const worst = drift.reduce((m, x) => Math.max(m, x.d), 0);
/* paint() works in HSL and never touches h, so any difference here is the rounding of the
   result to 8 bits per channel. Desaturated colours are the sensitive ones: sage sits on a
   channel spread of 21/255, so one quantum moves its computed hue by a couple of degrees. */
ok(worst < 6, 'hue unchanged between day and night', 'worst drift ' + worst.toFixed(2) + '°');
console.log('  ' + drift.map((x) => x.k + ' ' + x.a + '→' + x.b + ' Δ' + x.d.toFixed(1) + '°').join('  '));

/* --- group:update with a raw hex --- */
const gs = D.normalize(JSON.parse(JSON.stringify(base)));
D.applyOp(gs, { type: 'group:update', id: 'g2', patch: { color: '#c96f4a' } });
ok(gs.groups.find((g) => g.id === 'g2').color === '#c96f4a', 'custom hex stored',
  gs.groups.find((g) => g.id === 'g2').color);

/* --- clearCompleted drops the runs of what it removes --- */
let st = D.normalize(JSON.parse(JSON.stringify(base)));
D.applyOp(st, { type: 'todo:add', title: 'will finish', groupId: 'g1' });
const added = st.todos[st.todos.length - 1];
D.applyOp(st, { type: 'todo:toggle', id: added.id });
D.applyOp(st, { type: 'time:start', todoId: added.id });
const before = st.timeEntries.length;
D.applyOp(st, { type: 'todo:clearCompleted' });
ok(st.timeEntries.length === before - 1, 'clearCompleted drops its runs', before + ' → ' + st.timeEntries.length);

/* --- palette overrides are per material, and the old shared map migrates without a visual change --- */
const legacyStore = JSON.parse(JSON.stringify(base));
legacyStore.settings.palette = { paper: { '--brick': '#112233' }, ink: { '--paper': '#445566' } };
legacyStore.settings.style = 'hazard';
let mp = D.normalize(legacyStore);
ok(mp.settings.palette.hazard.paper['--brick'] === '#112233', 'legacy override kept under the material on screen',
  JSON.stringify(mp.settings.palette.hazard));
ok(mp.settings.palette.blueprint.paper['--brick'] === undefined, 'the other materials go back to their own defaults',
  JSON.stringify(mp.settings.palette.blueprint));
mp.settings.palette.blueprint.paper['--brick'] = '#990000';
ok(mp.settings.palette.hazard.paper['--brick'] === '#112233', 'a blueprint edit leaves hazard alone',
  mp.settings.palette.hazard.paper['--brick']);
ok(mp.settings.palette.hazard.ink['--paper'] === '#445566', 'the night half survives the reshape');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
