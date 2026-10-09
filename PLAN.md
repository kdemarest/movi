## Priorities

1. M01 visual language: layers, animation, camera pan/rotate/shake.
2. Timeline: `wait`/`sequence`/`parallel`/general `at`; deterministic seek reconstruction; scene transitions.
3. Audio, synced under pause/restart/seek/speed.
4. Asset prefetch and eviction under Android memory limits.
5. In-app persistent error list.
6. Polish: effects, syntax ergonomics, `.ms` once stable.

## Player View

- Controls still missing: skip scene, playback speed.
- Switching the source note loads that note's movie.
- Closing/reopening never alters or stores authoritative movie state.

## Layers

- Image and text layers. State lives in JS model objects; DOM/canvas is output only.
- Ops: `image` (create/replace), `text`, `remove`, `show`, `hide`, `order`, `group`, `ungroup`.
- Support z-order, visibility, grouping/parenting, masks.

## Animation

- Commands: `move`, `scale`, `rotate`, `fade`, `color`; each with duration, delay, easing.
- Properties: position, scale and rotation about an arbitrary point, alpha, brightness, contrast, saturation, tint, image replacement.

## Camera

- A transform over the rendered scene. Add `pan`, `rotateCamera`, `shake` (time-varying amplitude), and zoom toward any point.

## Effects and transitions

- `crossfade`, `wipe`, `flicker`, `scanlines`. Scene transitions: crossfade, wipe, zoom.

## Audio

- Independent music, voice, sfx: `music`, `sound`, `voice`, `volume`, `stopAudio`; timed start/stop/fade.
- Stays in sync under pause, restart, seek, skip, and speed changes.

## Timeline

- `wait`, `parallel`, `sequence`, `at <time>` for any action (today: caption anchors only); explicit holds.
- One authoritative movie clock. Seek reconstructs visual, camera, effect, caption, and audio state without replaying from the start.

## Scenes

- `scene`, `clear` (remove scene contents), `goto` (jump to scene), `event`, `end` (stop playback).
- Scenes hold timed/parallel/sequential actions, holds, transitions, text/captions, timed events/callbacks.

## Asset loading

- Preload upcoming images/audio; evict unneeded ones, so movies can exceed what Android can keep decoded at once.

## Errors

- Persistent in-app list of script (Parser/Content) errors (today: a Notice each).

## Not yet specified

- MoviScript beyond v0 (grammar, sugar, migration).
- How a note identifies its script; image/audio path resolution.
- Coordinate system and units beyond v0 anchors/percentages; scene size and aspect ratio.
- Easing names; mask and text styling syntax; event/callback semantics; transition arguments.
- Animation defaults; end-of-movie behavior; whether movies can reference other notes.

## Language design (MoviScript beyond today's commands)

- Priorities: brief and readable on mobile; deterministic playback and seek; fail loud on ambiguity. Must port cleanly to C#/Unity.
- Blocks: Python-style. Headers end in `:`, children indented with spaces only (2 recommended). Mixed tabs/spaces and mismatched dedents are errors. No braces.
- Comments: `#` to end of line. Identifiers: `[A-Za-z_][A-Za-z0-9_]*`, case-sensitive. Dotted anchors (`hero.hand`, `screen.center`).
- Literals: `<n>s`, `<n>%`, optional `<n>px`; decimal numbers.
- Timing: `at` for timeline time (`at 12s:`, `at +2.5s:`, `at anim:heroMove 40%:`, `at seq:intro -5s:`); `when` for runtime events (`when sound:radio.end:`). Prefer `at`.
- Names: unqualified by default. `kind:name` (e.g. `anim:heroMove`) is required only when ambiguous across kinds. Ambiguous or undefined names are errors, with nearest-name suggestions.
- Statements: `scene <name>`; declarations `image`, `text`, `music`, `sound`, `voice`; actions `move`, `scale`, `rotate`, `fade`, `color`, `pan`, `zoom`, `cut`, `rotateCamera`, `shake`, `show`, `hide`, `remove`, `order`, `group`, `ungroup`, `volume`, `stopAudio`, `goto`, `clear`, `end`, `event`; blocks `anim <name>:`, `sequence <name>:`, `parallel <name>:`, `at <ref>:`, `when <event>:`.
- Placement: `<anchor Q> + (<x>, <y>) of <reference W>`, i.e. offset from Q as a percentage of W (e.g. `hero.hand + (12%, -5%) of hero.bounds`). `%` with named anchors is primary; `px` only for nudges.
- Example:
  ```text
  scene intro
  image hero = "VID-M01-hero.png"
  sound radio = "VID-M01-radio.ogg"
  anim heroMove:
    move hero to screen.center + (10%, -5%) of screen over 8s ease inOut
  at anim:heroMove 40%:
    text caption "Something changes here"
  when sound:radio.end:
    goto next
  ```
- Errors: file, 1-based line and column, category (`Lex`/`Syntax`/`Semantic`), code (e.g. `MSYN001`), message, source excerpt, suggested fix.
- Parser: hand-written, identical in JS and C#: lexer → INDENT/DEDENT → recursive descent → semantic resolution → lowering to an engine-neutral timeline. No generator toolchain.
- The parser stays the single source of a script's `requiredAssets`; consumers never re-parse script text.
- Out of scope: formal grammar notation, macros, timeline editor, render-to-video.
