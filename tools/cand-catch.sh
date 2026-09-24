#!/usr/bin/env bash
# Catch the candidate-material sweep as it runs: the two pages announce each slot on the log
# with the same wall-clock index, so this waits for a new `[P] <n> <style>/<mv>/<hour>` line
# and grabs monitor 2 a moment into the slot (mid-slot, after the style transition has painted).
# Monitor 2 is the one at 1920,-88; the rectangle is pulled 1px inside the virtual screen
# because CopyFromScreen refuses one that touches its edge.
set -u
LOG="/c/Users/25817/AppData/Roaming/dev.qoder.pintauri/boot.log"
# aim at the panel window itself rather than the whole display: ${GX} ${GY} ${GW} ${GH} come from the
# sweep script, which reads them out of the live window
GX=${GX:-1921}; GY=${GY:--87}; GW=${GW:-1918}; GH=${GH:-1078}
OUT="$1"
mkdir -p "$OUT"
base=$(wc -l < "$LOG")
seen=""
deadline=$((SECONDS + 90))
while [ $SECONDS -lt $deadline ]; do
  line=$(tail -n +$((base+1)) "$LOG" | grep -E '^\[P\] [0-9]+ [a-z]+/[0-9]/' | tail -1)
  if [ -n "$line" ] && [ "$line" != "$seen" ]; then
    seen="$line"
    tag=$(echo "$line" | sed -E 's/^\[P\] ([0-9]+) ([a-z]+)\/([0-9])\/([a-z]+).*/\1-\2-\3-\4/')
    sleep 0.9
    powershell -NoProfile -ExecutionPolicy Bypass -File tools/cap.ps1 \
      -X $GX -Y $GY -W $GW -H $GH -Out "$OUT/$tag.png" >/dev/null
    echo "shot $tag"
  fi
  sleep 0.25
done
echo "done: $(ls "$OUT" | wc -l) shots"
