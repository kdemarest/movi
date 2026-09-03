#!/usr/bin/env bash
set -euo pipefail

if [[ "$(basename "$PWD")" != "movi" ]]; then
  echo "Run this from inside movi/ (cd movi && bash stop-watcher.sh)." >&2
  exit 1
fi

PID_FILE=".watcher.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "movi watcher: no PID file"
  exit 0
fi

pid="$(cat "$PID_FILE" 2>/dev/null || true)"
if [[ -z "$pid" ]]; then
  echo "movi watcher: empty PID file; removing"
  rm -f "$PID_FILE"
  exit 0
fi

if kill -0 "$pid" 2>/dev/null; then
  kill "$pid" || true
  for _ in {1..20}; do
    if kill -0 "$pid" 2>/dev/null; then
      sleep 0.1
    else
      break
    fi
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "movi watcher: process $pid did not exit; sending SIGKILL"
    kill -9 "$pid" || true
  fi
  echo "Stopped movi watcher process $pid"
else
  echo "movi watcher: process $pid is not running"
fi

rm -f "$PID_FILE"