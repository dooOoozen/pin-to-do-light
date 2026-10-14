/* Rewrites every hairline token in theme.css from a finished color-mix() into the pair the
   colour lab can drive: a source colour and a strength. Run once against src/theme.css. */
const fs = require('fs');
const FILE = __dirname + '/../src/theme.css';
const NAMES = ['edge', 'rule', 'rule-strong', 'grid-line', 'grid-line-bold', 'hatch-line',
  'wm-ink', 'hit-line', 'ink-glow', 'memo-rule'];
const RE = new RegExp('--(' + NAMES.join('|') + '):\\s*(color-mix\\(in srgb,\\s*(.+?)\\s+([\\d.]+)%,\\s*transparent\\)|var\\(--[a-z0-9-]+\\)|#[0-9a-fA-F]{3,8})\\s*;', 'g');

let src = fs.readFileSync(FILE, 'utf8');
let n = 0;
const out = src.replace(RE, (whole, name, rhs, mixSrc, mixPct) => {
  const colour = rhs.startsWith('color-mix') ? mixSrc : rhs;
  const pct = rhs.startsWith('color-mix') ? mixPct : '100';
  const srcTok = name === 'wm-ink' ? '--wm-src' : '--' + name + '-ink';
  n++;
  return srcTok + ': ' + colour + '; --' + name + '-a: ' + pct + '%;';
});
/* anything that still matches the old shape was not converted */
const left = out.match(RE) || [];
fs.writeFileSync(FILE, out);
console.log('converted=' + n + ' leftOver=' + left.length + (left.length ? ' :: ' + left.slice(0, 5).join(' ;; ') : ''));
