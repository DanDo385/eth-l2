#!/usr/bin/env bash
source "$(dirname "$0")/.env.sh"

echo "=== Stopping Anvil chains ==="

for pidfile in "$OUT_DIR"/pids/*.pid; do
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid"
      echo "Stopped process $pid ($(basename "$pidfile" .pid))"
    fi
    rm "$pidfile"
  fi
done

if [ "${CLEAN:-0}" = "1" ]; then
  echo "Cleaning out/ artifacts..."
  rm -rf "$OUT_DIR"
fi

echo "=== All chains stopped ==="
