#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "compileText failed: node not found in PATH." >&2
  exit 1
fi

node tools/compileText.js
