#!/usr/bin/env bash
# Catch the candidate-material sweep as it runs, and only ever label a frame with the slot it
# actually shows.
#
# The first version slept a fixed 0.9 s after seeing a new `[P] <n> …` line and then shot. Its
# own fingerprint loop takes well over a second per pass, so by the time the pixels were
# grabbed the sweep had moved on — a file named poster/4/ink held the chrome/1 plate, and the
# sheet was confidently wrong. So: read the slot, wait, read it again, and shoot only when the
# same slot is still on screen. A slot that gets missed is a gap in the sheet; a mislabelled
# one is a lie, and the user picks from these.
#
# Monitor 2 is the one at 1920,-88; the rectangle is pulled 1px inside the virtual screen
# because CopyFromScreen refuses one that touches its edge.
set -u
LOG="/c/Users/25817/AppData/Roaming/dev.qoder.pintauri/boot.log"
GX=${GX:-1921}; GY=${GY:--87}; GW=${GW:-1918}; GH=${GH:-1078}
OUT="$1"
mkdir -p "$OUT"
base=$(wc -l < "$LOG")
seen=""
deadline=$((SECONDS + 120))
while [ $SECONDS -lt $deadline ]; do
  line=$(tail -n +$((base+1)) "$LOG" | grep -E '^\[P\] [0-9]+ [a-z]+/[0-9]/' | tail -1)
  if [ -n "$line" ]; then
    tag=$(echo "$line" | sed -E 's/^\[P\] ([0-9]+) ([a-z]+)\/([0-9])\/([a-z]+).*/\1-\2-\3-\4/')
    if [ "$tag" != "$seen" ]; then
      sleep 1.0
      now=$(tail -n +$((base+1)) "$LOG" | grep -E '^\[P\] [0-9]+ [a-z]+/[0-9]/' | tail -1)
      nowtag=$(echo "$now" | sed -E 's/^\[P\] ([0-9]+) ([a-z]+)\/([0-9])\/([a-z]+).*/\1-\2-\3-\4/')
      if [ "$nowtag" = "$tag" ]; then
        powershell -NoProfile -ExecutionPolicy Bypass -File tools/cap.ps1 \
          -X $GX -Y $GY -W $GW -H $GH -Out "$OUT/$tag.png" >/dev/null
        echo "shot $tag"
      else
        echo "skip $tag (moved to $nowtag)"
      fi
      seen="$nowtag"
    fi
  fi
  sleep 0.2
done
echo "done: $(ls "$OUT" | grep -c '\.png$') shots"
