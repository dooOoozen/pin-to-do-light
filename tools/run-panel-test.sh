#!/bin/sh
# Run one panel/layer test script on the second display and print only the lines this run wrote.
#   sh tools/run-panel-test.sh tests/pal-lab.js [tag] [wait-seconds]
exe=src-tauri/target/release/pin-tauri.exe
log=src-tauri/target/release/data/boot.log
script=$1
tag=${2:-}
wait_s=${3:-26}

taskkill //IM pin-tauri.exe //F >/dev/null 2>&1
sleep 4
before=$(wc -c < "$log" 2>/dev/null || echo 0)
"$exe" --monitor 2 --panel --test-script-panel "$script" >/dev/null 2>&1 &
sleep "$wait_s"
taskkill //IM pin-tauri.exe //F >/dev/null 2>&1
sleep 1
tail -c +$((before + 1)) "$log"
