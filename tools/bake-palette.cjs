/* Writes the colours the user pinned in the colour lab into each material's own defaults.

   Their saved settings keep winning (an inline pin beats a stylesheet), so this changes nothing
   on this machine — it makes a fresh install and a machine that has never opened the lab agree
   with what they tuned. Values that belong to a mixed line token (--memo-rule and friends) are
   written as the source plus a 100% strength, because that is what data.js now migrates a stored
   pin into on load; writing the finished token would re-mute the strength slider.

   node tools/bake-palette.cjs [--write] */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const STORE = path.join(ROOT, 'src-tauri/target/release/data/dashboard1971-data.json');
const THEME = path.join(ROOT, 'src/theme.css');
const STYLE_IS = ['blueprint', 'print', 'diner', 'ikb', 'garden', 'console', 'frost', 'memphis', 'hazard', 'chrome'];
const LINE_SRC = {
  '--edge': ['--edge-ink', '--edge-a'], '--rule': ['--rule-ink', '--rule-a'],
  '--rule-strong': ['--rule-strong-ink', '--rule-strong-a'],
  '--grid-line': ['--grid-line-ink', '--grid-line-a'],
  '--grid-line-bold': ['--grid-line-bold-ink', '--grid-line-bold-a'],
  '--hatch-line': ['--hatch-line-ink', '--hatch-line-a'],
  '--wm-ink': ['--wm-src', '--wm-a'], '--hit-line': ['--hit-line-ink', '--hit-line-a'],
  '--ink-glow': ['--ink-glow-ink', '--ink-glow-a'], '--memo-rule': ['--memo-rule-ink', '--memo-rule-a']
};

const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
const pal = (store.settings && store.settings.palette) || {};
const css = fs.readFileSync(THEME, 'utf8');

/* what each material already ends up declaring, in the order the sheet applies it.
   The blocks carry only declarations, so the first `}` after the selector ends the block. */
function lastDeclared(style, hour, token) {
  const re = /:root\[data-style="([a-z]+)"\](\[data-theme="ink"\])?\s*\{([\s\S]*?)\}/g;
  let val = null, m;
  while ((m = re.exec(css))) {
    if (m[1] !== style) continue;
    const ink = !!m[2];
    if (hour === 'ink' ? !ink : ink) continue;
    const d = new RegExp('--' + token.slice(2) + ':\\s*([^;]+);').exec(m[3]);
    if (d) val = d[1].trim();
  }
  return val;
}

const emit = [];
let same = 0;
STYLE_IS.forEach((style) => {
  const one = pal[style] || {};
  ['paper', 'ink'].forEach((hour) => {
    const bag = one[hour] || {};
    const lines = [];
    Object.keys(bag).sort().forEach((token) => {
      const hex = bag[token];
      const pair = LINE_SRC[token];
      const want = hex;
      const cur = lastDeclared(style, hour, token);
      if (cur && cur.toLowerCase() === want.toLowerCase()) { same++; return; }
      if (pair) lines.push('  ' + pair[0] + ': ' + hex + '; ' + pair[1] + ': 100%;');
      else lines.push('  ' + token + ': ' + hex + ';');
    });
    if (lines.length) {
      emit.push('/* ' + style + ' · ' + (hour === 'ink' ? '夜间' : '白昼') + ' */\n'
        + ':root[data-style="' + style + '"]' + (hour === 'ink' ? '[data-theme="ink"]' : '') + ' {\n'
        + lines.join('\n') + '\n}');
    }
  });
});

const total = Object.keys(pal).reduce((a, s) => a + ['paper', 'ink'].reduce((b, h) => b + Object.keys((pal[s] || {})[h] || {}).length, 0), 0);
console.log('stored pins=' + total + ' already-in-sheet=' + same + ' blocks to write=' + emit.length);
if (!emit.length) process.exit(0);
const section = '\n\n/* ==========================================================================\n'
  + '   MATERIALS AS TUNED — the colours pinned in the colour lab on 2026-10-14, written in\n'
  + '   as each material\'s own default. The saved settings still apply on top of this, so\n'
  + '   nothing changes on the machine that tuned them; what changes is that 重置本主题 and a\n'
  + '   fresh install now land here instead of on the older values. A pin on a line token\n'
  + '   lands on its source at 100% strength, which is what data.js migrates a stored pin\n'
  + '   into, so the strength slider keeps working after the reset.\n'
  + '   ========================================================================== */\n'
  + emit.join('\n') + '\n';
if (process.argv.indexOf('--write') >= 0) {
  fs.writeFileSync(THEME, css.replace(/\s*$/, '') + '\n' + section);
  console.log('written');
} else {
  console.log(section);
}
