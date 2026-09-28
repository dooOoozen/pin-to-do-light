#!/usr/bin/env bash
# Drive the material plate shoot: launch the app with the two shooter scripts, crop the panel
# by the window rect winlist.ps1 reports for its pid, and photograph each plate as the renderer
# announces it. Polling the marker is the whole point — a capture fired on a guessed delay
# photographs the previous material and still looks perfectly plausible.
#
#   bash tools/shoot-plates.sh
#
# Output goes to docs/media/caps/ (gitignored) so nothing lands in the repository until each
# plate has been looked at. The store must already hold demo tasks, because a plate is a
# photograph of whatever the list really contains: swap them first and put the backup back
# byte-for-byte afterwards.
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
(cd "$ROOT" && nohup "$EXE" --test-script "$ROOT/tests/shoot-plates.js" --test-script-panel "$ROOT/tests/shoot-frame.js" > /tmp/shoot-plates.out 2>&1 &)

waitfor () {  # $1 = fixed string, $2 = seconds
  local i
  for i in $(seq 1 $(( $2 * 4 ))); do
    grep -qF "$1" "$LOG" 2>/dev/null && return 0
    sleep 0.25
  done
  return 1
}

if ! waitfor "PLATE print paper" 30; then echo "never got the first plate"; exit 1; fi
PID=$(pids | head -1)
RECT=$(powershell -NoProfile -ExecutionPolicy Bypass -File "$ROOT/tools/winlist.ps1" "$PID" 2>&1 | tr -d '\r' | grep -E "1[0-9]{3}x[0-9]{3} at" | head -1)
X=$(echo "$RECT" | sed -E 's/.* at (-?[0-9]+),(-?[0-9]+)/\1/')
Y=$(echo "$RECT" | sed -E 's/.* at (-?[0-9]+),(-?[0-9]+)/\2/')
echo "panel $RECT -> crop origin $X,$Y"

shoot () {  # $1 = marker, $2 = output name
  if ! waitfor "$1" 30; then echo "MISSING $1"; return 1; fi
  sleep 1
  powershell -NoProfile -ExecutionPolicy Bypass -File "$ROOT/tools/cap.ps1" -X "$X" -Y "$Y" -W 860 -H 554 \
    -Out "docs/media/caps/$2.png" 2>&1 | tr -d '\r' | sed 's/^/  /'
}

cd "$ROOT" || exit 1
while read -r style theme; do
  [ -z "${style:-}" ] && continue
  night=""; [ "$theme" = "ink" ] && night="-night"
  shoot "PLATE $style $theme" "cap-$style$night"
done <<'PLATES'
print paper
diner paper
ikb paper
garden paper
frost paper
console paper
garden ink
frost ink
console ink
print ink
diner ink
ikb ink
PLATES

waitfor "DONE restored" 30 || echo "no restore marker — check the material by hand"
for p in $(pids); do powershell -NoProfile -Command "Stop-Process -Id $p -Force"; done
echo "captured:"; ls -1 "$OUT" | sed 's/^/  /'
