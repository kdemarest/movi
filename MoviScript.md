## MoviScript

Reference for what the parser (`parser.js`) and player run today. Author only this. Planned language: `PLAN.md`.

## Script section

- The first heading (`#`–`######`) whose text starts with `Script` (case-insensitive). The body runs to the next heading.
- One statement per line. Blank lines and lines starting with `#` (no space after) are ignored.
- Files: `.md` or `.ms`.
- Dependency-check naming: `## Script <target>.ms` or `## Script: <target>.ms`. Dependencies come from `show` lines; there is no `Depends:`.

## Commands

```text
show <image> [as <name>] for <duration>s
zoom <target> to <level> for <duration>s [as <name>]
cut [<target>] at <level> for <duration>s [as <name>]
caption <duration>s <key> "<text>"
at <label> | at <label>+<n>s | at <label>-<n>s | at <label> <n>%
```

- `<duration>`: positive number + `s`. `<level>`: zoom factor > 0 (`1` = unzoomed).
- `show`: displays an image. Unnamed shows are auto-named `shot1`, `shot2`, ….
- `zoom`: animates the camera to `<level>` over `<duration>`, centered on `<target>`. `<target>` is required.
- `cut`: snaps the camera to `<level>`, centered on `<target>`, then holds for `<duration>`. With no target it holds the whole scene, centered.
- `zoom`/`cut` act on the most recent `show`, so they need one before them.
- `<target>`: a mark name from `<image>.marks.json` beside the shown image, or that show's own name (whole-image center). Anything else fails at playback.
- Labels (`as <name>` plus auto-names) share one namespace across the script and must be unique.

## Captions

- `caption` takes no time on the visual track. It starts with the most recent `show`/`zoom`/`cut` above it and lasts its own `<duration>`.
- `at …` re-anchors only the next line, which must be a `caption`. Its label must already be defined above.
  - `at x`: start of `x`. `at x+2s` / `at x-2s`: offset from it, no space; times before 0 clamp to 0. `at x 40%`: 40% through `x`'s duration (space before the number).
- A caption is cut off at the end of the visual track. When captions overlap, the later-starting one replaces the other.
- `<key>` is the localization key; `<text>` is the authoritative English. Escapes: `\"`, `\n`.
- `movi/compileText.sh` writes every `<key>: <text>` from scripts under `canvid/` into `canvid/English.txt`.
- Language comes from `"language"` in `canvid/_config.json` (default `English`). For other languages, text is looked up in `canvid/<language>.txt`, falling back to the inline English.

## Images

- Resolved from the script's folder first, then `canvid/`. Extensionless names try `.PNG` then `.png`. Matching is case-insensitive. Prefer explicit extensions.

## Errors

Parse errors fail loudly with file and line:
- `MPARSE001`: no Script section. `MPARSE002`: unknown command or bad syntax. `MPARSE003`: empty script.
- `MPARSE008`: duplicate label. `MPARSE009`/`MPARSE010`: `zoom`/`cut` before any `show`.
- `MPARSE011`: `at` names an unknown label. `MPARSE012`/`MPARSE013`: `at` not followed by a `caption`.
- Invalid duration or level, and non-positive values, are also parse errors.

Playback also fails on a missing image or an unresolvable zoom/cut target.

## Example

```markdown
## Script vid-m01-script.ms
show vid-m01-01.png as opening for 4.5s
caption 3s intro "Long ago..."
zoom aeku_head to 3 for 1.5s as push
at push 50%
caption 2s aeku_line "Aeku looks up."
```
