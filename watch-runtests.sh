#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VAULT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CMD_FILE="$VAULT_ROOT/RunTests.ai"
OUT_FILE="$VAULT_ROOT/RunTests.log"
LAST_FILE="$VAULT_ROOT/RunTests.last.log"
TMP_FILE="$VAULT_ROOT/RunTests.last.tmp"

if ! command -v inotifywait >/dev/null 2>&1; then
  echo "Missing dependency: inotifywait (install with: pkg install inotify-tools)" >&2
  exit 1
fi

touch "$CMD_FILE"
touch "$OUT_FILE"
touch "$LAST_FILE"

run_command() {
  local cmd="$1"
  local req
  local ts_start
  local ts_end
  local rc

  req="REQ-$(date -u +"%Y%m%dT%H%M%SZ")-$$"
  ts_start="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  {
    echo ""
    echo "=== BEGIN $req ==="
    echo "time_start: $ts_start"
    echo "command: $cmd"
    echo "output:"
  } > "$TMP_FILE"

  set +e
  case "$cmd" in
    "movi build")
      (cd "$VAULT_ROOT/movi" && bash ./build.sh) >> "$TMP_FILE" 2>&1
      rc=$?
      ;;
    "movi smoke")
      (cd "$VAULT_ROOT/movi" && bash ./build.sh) >> "$TMP_FILE" 2>&1
      rc=$?
      if [ $rc -eq 0 ]; then
        {
          echo "Built movi plugin."
          echo "Run Obsidian command: movi Run Smoke Tests"
        } >> "$TMP_FILE"
      fi
      ;;
    "movi tail-log")
      if [ -f "$VAULT_ROOT/movi.log" ]; then
        tail -n 80 "$VAULT_ROOT/movi.log" >> "$TMP_FILE" 2>&1
        rc=0
      else
        echo "movi.log not found" >> "$TMP_FILE"
        rc=1
      fi
      ;;
    *)
      echo "Unknown command: $cmd" >> "$TMP_FILE"
      echo "Supported commands: movi build | movi smoke | movi tail-log" >> "$TMP_FILE"
      rc=2
      ;;
  esac
  set -e

  ts_end="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  {
    echo "exit_code: $rc"
    echo "time_end: $ts_end"
    echo "=== END $req ==="
  } >> "$TMP_FILE"

  mv "$TMP_FILE" "$LAST_FILE"
  cat "$LAST_FILE" >> "$OUT_FILE"
}

process_file() {
  local line
  line="$(grep -v '^[[:space:]]*$' "$CMD_FILE" | head -n 1 || true)"
  if [ -z "$line" ]; then
    return
  fi

  run_command "$line"
  : > "$CMD_FILE"
}

process_file

echo "Watching $CMD_FILE"
while true; do
  inotifywait -q -e close_write "$CMD_FILE" >/dev/null
  process_file
done
