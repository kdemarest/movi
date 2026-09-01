#!/data/data/com.termux/files/usr/bin/bash
set -e

# Source ordering convention (no build.sh edits needed):
# - Keep the Movi/register bootstrap in a file that sorts first (recommended: __register.js).
# - Keep other files order-independent where possible.
# - If declaration-time dependency is unavoidable, express it in filename order.

MANIFEST="manifest.json"

if [ ! -f "$MANIFEST" ]; then
  echo "Build failed: manifest.json not found in $(pwd)" >&2
  exit 1
fi

ID=$(grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]+"' "$MANIFEST" | sed -E 's/.*"([^"]+)"/\1/' | head -n 1)

if [ -z "$ID" ]; then
  echo "Build failed: manifest.json is missing a valid id" >&2
  exit 1
fi

DEST="../.obsidian/plugins/$ID"
mkdir -p "$DEST"

JS_FILES=$(find . -maxdepth 1 -type f -name '*.js' | sort)

if [ -z "$JS_FILES" ]; then
  echo "Build failed: no source .js files found in $(pwd)" >&2
  exit 1
fi

: > "$DEST/main.js"
for f in $JS_FILES; do
  cat "$f" >> "$DEST/main.js"
  echo >> "$DEST/main.js"
done

cp "$MANIFEST" "$DEST/manifest.json"

# Tell Obsidian Hot Reload to watch this plugin.
touch "$DEST/.hotreload"

echo "Built $ID"