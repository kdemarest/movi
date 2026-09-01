

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

v0 foundations now implemented:

- plugin bootstrap with manifest-driven build output;
- controlled runtime logging to `movi.log` with append-on-load run headers;
- structured log entries for category/code/operation/message context;
- log trimming on append with default 6 KB cap;
- console + log-file error output path;
- MoviScript parser v0 foundation for `# Script` discovery and minimal `show <image> for <duration>s` commands;
- built-in smoke-test runner command: `movi Run Smoke Tests`;
- logger and parser smoke tests (format/trim plus basic parser success/error cases);
- optional Termux file-watcher script (`movi/watch-runtests.sh`) for `RunTests.ai` command-driven build/smoke workflow with output appended to `RunTests.log`;
- active-file script validation command: `movi Validate Active Script` (`.md`/`.ms`) with parse-success notices and fail-loud parser/content error logging to console + `movi.log`.


## Planned

movi is a script-driven still-image movie system implemented as an Obsidian plugin. Markdown script is the source of truth. A movie is defined by script commands associated with a Markdown file and is played in a single logical movi Player View.

For v0, authoring and playback are the same workspace flow: edit a Markdown file, write a `# Script` section, and run it directly in the movi Player View.

Language rules for MoviScript v0 are defined in `MoviScript.md`, including block syntax, timing triggers, naming/disambiguation rules, and layer coordinate conventions.

Renderer code must not parse or interpret Markdown during playback.


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