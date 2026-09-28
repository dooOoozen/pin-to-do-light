#!/usr/bin/env bash
# Re-shoot the ledger hover clip for the README without photographing the author's real task
# titles: the store must already hold a demo board (same rule as tools/shoot-plates.sh), the
# recorder drives a real SetCursorPos because a scripted hover would light up a row nobody
# could point at, and the crop comes from tests/shoot-hover.js's CSS boxes scaled by the
# window rect rather than from the CSS numbers themselves.
#
#   bash tools/shoot-hover.sh
#
# Writes docs/media/caps/hover.{rgb,json,steps} and docs/media/caps/ledger-hover.gif, all
# gitignored. Nothing lands in the repository until the clip has been watched.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$APPDATA/dev.qoder.pintauri/boot.log"
OUT="$ROOT/docs/media/caps"
EXE="$ROOT/src-tauri/target/release/pin-tauri.exe"
mkdir -p "$OUT"

pids () {
  powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='pin-tauri.exe'\" | Select-Object -ExpandProperty ProcessId" | tr -d '\r'
}
for p in $(pids); do powershell -NoProfile -Command "Stop-Process -Id $p -Force"; done
sleep 2
rm -f "$LOG"
(cd "$ROOT" && nohup "$EXE" --monitor 2 --panel --test-script-panel "$ROOT/tests/shoot-hover.js" > /dev/null 2>&1 &)

for i in $(seq 1 120); do grep -qF "HOVER-READY" "$LOG" 2>/dev/null && break; sleep 0.5; done
grep -qF "HOVER-READY" "$LOG" || { echo "panel never got ready"; exit 1; }

PID=$(pids | head -1)
RECT=$(powershell -NoProfile -ExecutionPolicy Bypass -File "$ROOT/tools/winlist.ps1" "$PID" 2>&1 | tr -d '\r' | grep -E "1[0-9]{3}x[0-9]{3} at" | head -1)
echo "panel $RECT"

LOG="$LOG" RECT="$RECT" OUT="$OUT" node -e '
const fs = require("fs");
const { LOG, RECT, OUT } = process.env;
const line = fs.readFileSync(LOG, "utf8").split(/\r?\n/).filter(l => l.includes("GEOM {")).pop();
const g = JSON.parse(line.slice(line.indexOf("GEOM {") + 5));
const [rw, rh, rx, ry] = RECT.match(/(\d+)x(\d+) at (-?\d+),(-?\d+)/).slice(1, 5).map(Number);
const sx = rw / g.css[0], sy = rh / g.css[1];
const px = (v) => Math.round(rx + v * sx), py = (v) => Math.round(ry + v * sy);
const left = Math.min(g.composer[0], g.list[0]), right = Math.max(g.composer[2], g.list[2]);
/* end at the last row rather than at the bottom of the list: three demo tasks in a tall
   ledger otherwise photograph as three tasks floating in a field of empty paper */
const bottom = Math.min(g.list[3], (g.last ? g.last[3] : g.list[3]) + 16);
const top = Math.max(0, g.composer[1] - 6);
const crop = { X: px(left), Y: py(top), W: Math.round((right - left) * sx), H: Math.round((bottom - top) * sy) };
crop.W = Math.min(crop.W, rx + rw - crop.X);
crop.H = Math.min(crop.H, ry + rh - crop.Y);
/* aim a third of the way down the row, not at its top edge: the edge belongs to the
   separator above it and a cursor that lands there hovers nothing */
const row = { X: px(g.row[0] + 90), Y: py(g.row[1] + (g.row[3] - g.row[1]) * 0.35) };
const away = { X: crop.X + 12, Y: crop.Y + 12 };
const steps = [
  "raise " + rw,
  "move " + away.X + " " + away.Y, "wait 500", "grab 8 90",
  "move " + row.X + " " + row.Y, "wait 150", "grab 24 70",
  "move " + away.X + " " + away.Y, "wait 120", "grab 8 90", ""
].join("\n");
fs.writeFileSync(OUT + "/hover.steps", steps);
/* 1:1 with CSS pixels, not with device pixels: the panel is zoomed, so encoding at the
   native grab width would print the README clip at 140% of everything else in the table */
fs.writeFileSync(OUT + "/hover.env",
  "CX=" + crop.X + "\nCY=" + crop.Y + "\nCW=" + crop.W + "\nCH=" + crop.H +
  "\nMW=" + Math.round(crop.W / sx) + "\n");
console.log("css=" + g.css.join("x") + " scale=" + sx.toFixed(3) + "x" + sy.toFixed(3) +
  " rows=" + g.rows + " titles=" + JSON.stringify(g.titles));
console.log("crop " + crop.W + "x" + crop.H + " at " + crop.X + "," + crop.Y +
  "  row " + row.X + "," + row.Y + "  away " + away.X + "," + away.Y);
' || exit 1

. "$OUT/hover.env"
cat "$OUT/hover.steps"

cd "$ROOT" || exit 1
powershell -NoProfile -ExecutionPolicy Bypass -File "$ROOT/tools/grab-frames.ps1" \
  -X "$CX" -Y "$CY" -W "$CW" -H "$CH" -Out "docs/media/caps/hover" \
  -Plan "$OUT/hover.steps" 2>&1 | tr -d '\r' | sed 's/^/  /'

for p in $(pids); do powershell -NoProfile -Command "Stop-Process -Id $p -Force"; done

node "$ROOT/tools/gif-encode.mjs" docs/media/caps/hover docs/media/caps/ledger-hover.gif "$MW"
ls -la docs/media/caps/hover.rgb docs/media/caps/hover.json docs/media/caps/ledger-hover.gif
