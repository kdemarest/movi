## Purpose

This manual is the root authoring contract for MoviScript sections.

Its primary use is to tell AI agents exactly what script commands are currently supported by code, so generated scripts are runnable without parser/runtime errors.

## Current implementation scope (code-true)

As of current movi parser/runtime, only this v0 command surface is executable:

- `show <image> for <duration>s`
- `show <image> as <name> for <duration>s`
- `zoom <targetName> to <level> for <duration>s`

Anything else (for example `scene`, `wait`, `pan`, `fade`, `music`, `parallel`, `at`, `when`) is not currently executable and should not be authored unless the user explicitly asks for future/planned syntax.

## Where Script is discovered

For playback parsing (movi):
- movi scans the file and uses the first heading whose text starts with `Script` (case-insensitive; heading levels 1-6 accepted).
- Script body starts on the next line and continues until the next heading.

For dependency validation (gptviz):
- Script operation headings are recognized as `Script <name>` or `Script: <name>`.
- In practice you may write `# Script ...` or `## Script ...` in notes.

## Playback command grammar (author exactly like this)

### 1) Show

Required form:
- `show <image> for <duration>s`

Optional named-shot form:
- `show <image> as <name> for <duration>s`

Notes:
- `<duration>` must be a positive decimal number (`1`, `2.5`, etc.) followed by `s`.
- If `as <name>` is omitted, movi auto-assigns names (`shot1`, `shot2`, ...).
- Explicit show names must be unique within the Script section.

### 2) Zoom

Required form:
- `zoom <targetName> to <level> for <duration>s`

Notes:
- `<level>` must be a positive number (`> 0`).
- `<duration>` must be positive seconds with `s` suffix.
- `zoom` must appear after at least one `show` command.

## Zoom target resolution behavior

When parsing succeeds and playback is prepared:

- movi binds each `zoom` to the current shown image (the most recent `show`).
- `<targetName>` is resolved in this order:
  1) mark name from `<image-basename>.marks.json` sidecar, or
  2) current show name (from `as <name>` or auto name).

If target resolution fails, playback fails loudly.

Practical guidance:
- If you want mark-target zoom, ensure matching sidecar exists with normalized `x/y` in `0..1`.
- If no sidecar/mark is intended, set `zoom <targetName>` equal to the show name so zoom can still run (center anchor fallback behavior).

## File and asset rules relevant to authoring

- movi Play/Validate accepts active `.md` or `.ms` files.
- `show <image>` resolution checks script directory first, then the content root (`canvid/`).
- If extension is omitted, movi tries `.PNG` and `.png`.
- Case-insensitive path matching is attempted.

Recommendation:
- Prefer explicit image filenames with extension to reduce ambiguity.

## Dependency-authored Script target guidance

When Script is authored as a dependency operation target (for `_deps.md` workflows):

- Use `# Script <targetfile>` or `# Script: <targetfile>`.
- Prefer explicit `.ms` target names.
- Keep target names stable across edits.
- Do not use `Depends:` declarations; script dependencies are inferred from parsed script commands.

Example:
```markdown
## Script vid-m01-script.ms
show vid-m01-01 for 4.5s
zoom aeku_head to 3 for 1.5s
```

## Hard-error conditions AI should avoid

- missing Script section
- unknown/unsupported command
- invalid duration token (must be `<number>s`)
- non-positive duration
- non-positive zoom level
- zoom before any show
- duplicate explicit show name
- missing image asset
- missing/invalid mark sidecar when required by zoom target

## AI authoring checklist

- Author only `show` and `zoom` commands for runnable scripts.
- Keep one command per line.
- Use explicit positive second durations (`s`).
- Keep zoom targets intentional: mark name (with sidecar) or show name fallback.
- Avoid planned-language syntax unless user asks for non-runnable draft syntax.
