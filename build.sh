#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

# Assembles every .js file into one bundle, maps bundle lines back to source files
# (runtime-code-map.json, used by _lastErr.log), syntax-checks it, then installs it.
# _preamble.js (unit/runUnits) goes first; every other file is a unit, so their order is irrelevant.

DEST="../.obsidian/plugins/movi"
STAGING="assembled-plugin.js"
MAP_PATH="runtime-code-map.json"

command -v node >/dev/null || { echo "Build failed: node not found in PATH." >&2; exit 1; }

mapfile -t UNIT_FILES < <(
  find . -maxdepth 1 -type f -name '*.js' ! -name "$STAGING" ! -name '_preamble.js' | sort
)
JS_FILES=("./_preamble.js" "${UNIT_FILES[@]}")

: > "$STAGING"
CURRENT_LINE=1
MAP_ENTRIES=""

for FILE in "${JS_FILES[@]}"; do
  SOURCE_LINES=$(awk 'END { print NR + 0 }' "$FILE")
  cat "$FILE" >> "$STAGING"
  printf '\n' >> "$STAGING"

  END_LINE=$((CURRENT_LINE + (SOURCE_LINES > 0 ? SOURCE_LINES - 1 : 0)))
  ENTRY="    { \"sourcePath\": \"movi/${FILE#./}\", \"sourceStartLine\": 1, \"bundleStartLine\": $CURRENT_LINE, \"bundleEndLine\": $END_LINE }"
  MAP_ENTRIES+="${MAP_ENTRIES:+,$'\n'}$ENTRY"
  CURRENT_LINE=$((CURRENT_LINE + SOURCE_LINES + 1))
done

# Run every unit now that the whole bundle has loaded.
printf 'runUnits();\n' >> "$STAGING"

cat > "$MAP_PATH" <<JSON
{
  "project": "movi",
  "generatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "bundlePath": ".obsidian/plugins/movi/main.js",
  "entries": [
$MAP_ENTRIES
  ]
}
JSON

node --check "$STAGING" || { echo "Build failed: syntax check failed for $STAGING." >&2; exit 1; }
# Load test (construct, onload, onunload against a fake Obsidian) plus the parser/logger tests.
node ../tools/jsload.js "$STAGING" movi --test "Movi.Test.runAll()"

mkdir -p "$DEST"
cp "$STAGING" "$DEST/main.js"
cp manifest.json "$DEST/manifest.json"
# Tell Obsidian Hot Reload to watch this plugin.
touch "$DEST/.hotreload"

echo "Built movi and wrote $MAP_PATH"
