## Overview

- Scope: this spec defines required movi behavior and tracks local implementation status.
- Workflow: keep changes minimal, preserve behavior unless requested, and record shipped work under Implemented.
- Constraint: update Implemented while implementing; do not edit Planned unless explicitly requested.
- Runtime priorities: deterministic script-driven playback, strict Parser/Content error handling, and Android-compatible Obsidian operation.
- Use this doc to validate required behavior, current delivery state, and remaining planned surface.




## Usage

This spec is optimized for AI runtime context efficiency.

- Keep ## Implemented concise and contract-focused.
- Keep ## Planned detailed and design-focused.

Implemented update rules:

- Record capability-level outcomes, not implementation narrative/history.
- Include only behavior constraints/invariants needed to prevent regressions.
- Prefer short bullets over long prose.
- When helpful, include brief code pointers (file/function) instead of duplicating code behavior.
- Avoid restating behavior that is obvious from nearby code unless it is easy to regress.

Planned update rules:

- Keep full behavioral detail, data shapes, error expectations, and non-goals.
- Treat Planned as the authoritative intent for future implementation.

Goal: minimize token cost while preserving enough contract detail for safe future edits.

## Intended use and working conventions

movi is being developed against real project data, starting with VID-M01, rather than abstract test-only scripts.

Current media/script conventions:

- Image assets for a movie live in the directory directly above movi/.
- Asset files are flat (no required nested folder structure).
- Image assets are `.PNG` files derived from AI-generated `.md` specifications.
- The working playback script for Movie 01 is `VID-M01-SCRIPT.md`.
- During language development, movi should accept both `.md` and `.ms` script files.
- `.ms` (MoviScript) is the intended long-term script extension once v0 syntax is stable.

## Purpose

movi defines a script-driven still-image movie system with predictable, timeline-based playback.

Near-term, this plugin is a practical sandbox inside Obsidian for authoring and validating movie behavior.

Long-term, the same core philosophy is intended to carry into a C# Unity VR implementation where movies are projected into the game world by a projectorBot. Players can watch the movie while retaining freedom of movement and viewpoint from any angle.

Design philosophy:

- keep behavior explicit and deterministic;
- favor simple, composable motion/audio primitives over hidden automation;
- separate script intent, playback state, and rendering details so the runtime can evolve without changing movie semantics.


## Development priorities

v0 priority is Parser + Player + Logger as first-class subsystems.

First runnable milestone: execute a `# Script` section in Markdown that does only sequential still playback (show image, hold duration, then next image), with fail-loud diagnostics.

1. **Core v0 vertical slice (must-have first)**
   - parse `# Script` from the active Markdown file
   - play sequential still images with explicit durations
   - no layers/compositing in this slice
   - strict Parser/Content error classification
   - v0 error output: `console.error()` + `movi.log` only
   - trim `movi.log` on append to a small configurable cap (default 6 KB)

2. **Minimum visual language for M01**
   - image layer create/show/hide/order/remove
   - move/scale/rotate/fade/color basics
   - camera pan/zoom/rotation

3. **Timeline composition stability**
   - wait/sequence/parallel/at scheduling
   - deterministic seek reconstruction
   - robust scene transitions between scene blocks

4. **Audio synchronization**
   - music/sound/voice start-stop-volume-fade
   - correct sync under pause/restart/seek/speed changes

5. **Asset strategy for real workloads**
   - prefetch near-future assets
   - eviction under Android memory constraints
   - predictable path resolution for M01 asset layout

6. **Failure surfaces and diagnostics**
   - add persistent in-app error list after v0
   - keep operation-context error logging in `movi.log`

7. **Secondary polish features**
   - additional effects/transitions
   - expanded script syntax ergonomics
   - optional MoviScript (`.ms`) path once behavior is stable

## Implemented

### Runtime and diagnostics contracts

- Plugin bootstrap and manifest-driven build output are in place.
- Runtime logging writes structured entries to `movi.log` and appends per-load run headers.
- Log trimming is enforced on append (default cap: 6 KB).
- Fail-loud v0 error path is console + `movi.log` with parser/content categorization.

### Parser and validation contracts

- MoviScript parser v0 is implemented for `# Script` discovery and minimal `show <image> for <duration>s` command parsing.
- `movi Validate Active Script` validates active `.md`/`.ms` scripts and reports parse/content failures through fail-loud logging.
- `movi Run Smoke Tests` exists for parser/logger smoke validation.

### Playback contracts

- `movi Play` performs upfront parse/content validation and executes sequential `show <image> for <duration>s` playback in a single reusable movi Player View.
- Zoom actions are supported after show: `zoom <name> to <level> for <duration>s`.
- Zoom can target mark names resolved from `<image-basename>.marks.json` and centers target framing by action end.
- When show is immediately followed by zoom actions, zoom durations define hold/motion timing for that shown image.

### View and rendering contracts

- Player View renders zoom-anchor debug marker (magenta dot) for target verification.
- Player frame clips transformed image output (`overflow: hidden`) for viewport-cropped pan/zoom behavior.
- From GPTViz Candidate View, a `Movi Play` ribbon action resolves the current candidate and lists matching markdown scripts that use that asset in `show` lines.

### Project-local watcher isolation

- Optional watcher flow is project-local to movi:
  - scripts: `movi/watch-runbash.sh`, `movi/start-watcher.sh`, `movi/stop-watcher.sh`
  - files: `movi/RunBash.ai`, `movi/RunBash.log`, `movi/RunBash.last.log`, `movi/.runbash-watcher.heartbeat`

## Planned

movi is a script-driven still-image movie system implemented as an Obsidian plugin. Markdown script is the source of truth. A movie is defined by script commands associated with a Markdown file and is played in a single logical movi Player View.

For v0, authoring and playback are the same workspace flow: edit a Markdown file, write a `# Script` section, and run it directly in the movi Player View.

Language rules for MoviScript v0 are defined in `MoviScript.md`, including block syntax, timing triggers, naming/disambiguation rules, and layer coordinate conventions.

Renderer code must not parse or interpret Markdown during playback.

movi may also consume optional sidecar metadata files generated by companion tooling (for example gptviz mark points in `<basename>.marks.json`) to support target-based camera/layer operations.


## Player View

**movi Play** opens or reveals the movi Player View for the current Markdown file.

There is one logical movi Player View type. Opening another movie reuses that view rather than creating duplicate Player View leaves.

The Player View provides:

- Play
    
- Pause
    
- Restart
    
- Seek
    
- Skip scene
    
- Adjustable playback speed
    

Changing the source Markdown file causes the Player View to load that file's movie.

Closing and reopening the Player View does not alter the movie definition or store authoritative movie state in the view.

## Assets and layers

A movie may contain image and text layers.

Layer state is authoritative in JavaScript model objects; DOM/Canvas objects are rendering outputs only.

Supported layer operations are:

- `image` — create or replace an image layer
    
- `text` — create a text layer
    
- `remove`
    
- `show`
    
- `hide`
    
- `order` — change z-order
    
- `group`
    
- `ungroup`
    

Layers support:

- z-order
    
- visibility
    
- grouping and parenting
    
- masks
    

## Layer animation

Supported animation commands are:

- `move`
    
- `scale`
    
- `rotate`
    
- `fade`
    
- `color`
    

Animatable properties include:

- position
    
- scale around an arbitrary point
    
- rotation around an arbitrary point
    
- alpha
    
- brightness
    
- contrast
    
- saturation
    
- tint
    
- image replacement
    

Animation commands support duration, delay, and easing.

## Camera

The camera is treated as a transform over the rendered scene.

Supported camera commands are:

- `pan`
    
- `zoom`
    
- `rotateCamera`
    
- `shake`
    

Camera behavior includes:

- pan
    
- zoom toward an arbitrary point
    
- rotation
    
- shake with amplitude varying over time
    

## Effects and transitions

Supported effects and transitions are:

- `crossfade`
    
- `wipe`
    
- `flicker`
    
- `scanlines`
    

Scene transitions may include crossfades, wipes, and zoom transitions.

## Audio

A movie may contain independent music, voice, and sound-effect audio.

Supported audio commands are:

- `music`
    
- `sound`
    
- `voice`
    
- `volume`
    
- `stopAudio`
    

Audio supports timed start, stop, and fades.

Audio remains synchronized with visual playback when the movie is paused, restarted, sought, skipped, or played at an adjusted playback speed.

## Timeline

Supported timeline commands are:

- `wait`
    
- `parallel`
    
- `sequence`
    
- `at` — schedule an action at a timestamp
    

Actions may execute sequentially or in parallel.

The timeline supports explicit waits and holds.

Playback and seeking are based on one authoritative movie-time clock. Seeking to a time reconstructs the appropriate visible, camera, effect, caption, and audio state for that time rather than requiring playback from the beginning.

## Scenes

Supported scene/playback commands are:

- `scene`
    
- `clear`
    
- `goto`
    
- `event`
    
- `end`
    

Scenes may contain:

- timed actions
    
- parallel actions
    
- sequential actions
    
- holds and waits
    
- transitions
    
- text and captions
    
- timed events and callbacks
    

`goto` changes playback to another scene.

`clear` removes the current scene contents.

`end` terminates movie playback.

## Asset loading

movi preloads upcoming image and audio assets before they are needed.

Assets that are no longer useful may be evicted from memory.

Asset loading and eviction must allow movies containing substantially more media than can reasonably remain decoded in Android memory simultaneously.

## Script errors

Invalid commands, malformed arguments, missing required assets, impossible references, and other script errors produce descriptive errors rather than silently ignoring the operation.

A movie must not silently continue in an undefined state after a catastrophic parsing or playback failure.

## Failure presentation

movi is a single-user developer tool and fails loudly.

For v0, error output is intentionally limited to controlled logging channels:

- `console.error()` output; and
- structured append-only entries in `movi.log`.

Errors are classified as Parser or Content and should include operation context with file and line information when available.

In-app blocking/persistent error surfaces are deferred until after the first vertical slice.

## Runtime logging

Each plugin load appends a new run header to the vault-root `movi.log` file: a blank line, the run date/time, and a blank line.

Each reported error is appended with its timestamp, operation context, category/code, message, and stack when available.

`movi.log` is trimmed on each append to a small configurable cap (default 6 KB), preserving newest entries.

Runtime log files are ignored by Git.

## Mark sidecar integration (planned)

movi will support optional mark-point sidecar metadata for target-aware shot operations.

- Sidecar filename v0: `<image-basename>.marks.json` for the shown image being targeted.
- Sidecar source: generated externally (for example gptviz `# Mark` workflows).
- Expected payload: named points with normalized coordinates (`x`,`y` in `0..1`) and optional confidence metadata.
- Script usage intent: commands may reference mark names (for example camera zoom/pan targets) without hardcoding raw coordinates in script lines.
- Validation: missing or malformed sidecar data produces fail-loud Content errors when referenced by script.
- Nonfatal behavior: if script does not reference marks, sidecar presence is optional and ignored.

## Not yet specified

The following details are intentionally not yet defined:

- MoviScript versions beyond v0 (grammar extensions, additional sugar, and migration rules)
    
- how a Markdown file identifies or contains its movi script
    
- image and audio path resolution rules
    
- coordinate system and units (beyond v0 anchor/reference-percent conventions)
    
- scene dimensions and aspect-ratio behavior
    
- exact easing names
    
- mask syntax
    
- text styling syntax
    
- event/callback semantics
    
- transition arguments
    
- default values for animation properties
    
- behavior when playback reaches the end
    
- whether movies can reference other Markdown files
    
- video-file export or MP4 rendering