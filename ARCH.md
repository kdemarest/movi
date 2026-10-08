## Overview

- Scope: this file defines architecture constraints for movi’s parser/runtime/player system.
- Source of truth: movie behavior comes from script files interpreted into model/timeline state before playback.
- Platform/build: plain JavaScript for Obsidian (Android-compatible), built with the existing concat/copy workflow.
- Core invariants: subsystem separation, single authoritative playback clock, one logical Player View lifecycle path, and fail-loud diagnostics.
- Use this doc for boundaries, lifecycle, timing model, failure policy, and architectural invariants.


## Scope

This document defines the architectural constraints for movi.

movi is a plain-JavaScript Obsidian plugin intended to run on Android.

Ecosystem note: movi is part of a lightweight workflow with gptviz, where source images may be generated/refined in gptviz and then consumed by movi scripts for playback iteration.

Workflow note: author script and asset references in Markdown/MoviScript, regenerate assets as needed, then replay quickly in a single movi Player View.

## Build and platform constraints

- Source files live in `vault/movi/`.
- `build.sh` concatenates source `.js` files into installed `main.js` and copies `manifest.json` to `vault/.obsidian/plugins/movi/`.
- No ES modules, bundlers, transpilers, TypeScript, `require()`, npm tooling, or alternate build systems.
- Use Obsidian APIs for app services (vault, settings, HTTP, workspace).
- Use browser-compatible APIs; do not rely on Node.js, Electron, or desktop-only APIs.

`main.js` should stay focused on startup, command/view registration, and integration wiring.

## Source-file boundaries

Concatenation must not create accidental coupling.

- Define `Movi` and `register()` in the first concatenated file (recommended filename: `__register.js`).
- Every other source file registers exactly one factory.
- Everything inside a factory is private unless returned.
- Only returned symbols are added to `Movi`.
- Do not create additional globals.

Reference pattern:

```js
const Movi = {};

function register(factory) {
    Object.assign(Movi, factory());
}

register(() => {
    class Timeline {}
    function parseTime(value) {}
    return { Timeline, parseTime };
});
```

Cross-file usage should go through `Movi` at use time, not captured eagerly at file load time. Avoid hidden ordering dependencies (for example `const Timeline = Movi.Timeline` at top level).

If a construct inherently requires declaration-time dependency (for example `class X extends Movi.Base`), either redesign it or explicitly document and enforce ordering.

## Subsystem separation

Keep responsibilities separate even though output is one concatenated file:

- script parsing
- asset management
- layers / scene graph
- animation and easing
- timeline execution
- camera
- effects and transitions
- audio
- playback control
- Obsidian Player View
- plugin integration

## Data and execution model

Markdown script is the source of truth.

Playback pipeline:

```text
Markdown + optional sidecar metadata → Parser → Movie/Scene/Action model → Timeline → Renderer + Audio
```

Rules:

- Renderer must not parse/interpret Markdown during playback.
- Malformed scripts must fail with descriptive errors.
- Layer state is authoritative in JavaScript model objects; DOM/Canvas are render outputs only.
- Parent transforms propagate to children.
- Animation modifies model state, not ad-hoc DOM state.
- Optional sidecar metadata (for example `<script-or-source-basename>.marks.json`) is read before playback as structured input; sidecars are never parsed during active frame rendering.
- Sidecar metadata is advisory scene data, not executable script; script commands remain the authoritative control flow.

## Timeline and playback clock

All timed behavior is represented as timeline actions (motion, transforms, fades, color, camera, effects, audio, waits, events, transitions) with explicit timing fields (start, duration, delay, easing).

Sequential and parallel behavior are compositions of the same action model.

There is exactly one authoritative playback clock. Animation, camera, effects, events, captions, and audio must all derive from it.

Seeking must reconstruct state from timeline time; playback cannot depend only on irreversible incremental side effects.

## Rendering and audio

Rendering runs in an Obsidian custom view using DOM/CSS and browser APIs (Canvas optional where useful). No Electron-specific rendering assumptions.

Camera is a transform above scene (pan/zoom/rotation/shake).

Effects (for example brightness/contrast/saturation/tint/flicker/scanlines/masks/crossfade/wipe) must use browser-compatible techniques.

Audio (music/voice/SFX) uses browser-compatible audio APIs, scheduled by timeline/playback logic, not by isolated UI control logic.

## Asset management

Images and audio are vault assets.

Asset manager owns loading, lookup, caching, prefetch, and eviction. It must account for Android memory limits.

Layers request assets through the asset manager; they do not implement their own loading stacks.

Sidecar metadata contract (planned):

- movi may consume root-level `.json` sidecars generated by companion tools (for example gptviz marks output).
- Initial supported sidecar shape is mark-point metadata containing normalized coordinates (`x`,`y` in `0..1`) and mark names.
- Sidecar lookup should be deterministic and simple: resolve by shown image basename as `<image-basename>.marks.json` in the same folder as the image; future expansion may add explicit script-level source mapping.
- Missing sidecar is not fatal unless the script explicitly references required marks.
- Invalid sidecar JSON or invalid coordinate ranges must fail loudly as Content errors with file path context.

## Player View lifecycle

movi has one logical Player View type.

Opening a movie should reuse an existing Player View when possible and remove unintended duplicates.

All entry points should converge on one open/load flow that:

1. identifies source Markdown;
2. locates or creates Player View;
3. removes unintended duplicate Player Views;
4. associates view with source;
5. reveals view when appropriate;
6. loads or refreshes movie.

The view is not authoritative state. Closing/recreating it must be safe because persistent truth is the Markdown + parsed model.

Handle plugin-reload recovery separately from normal open flow.

## Failure policy

movi is a single-user developer tool; failures must be obvious.

Error classes:

- Parser errors: syntax/structure issues in the `# Script` section.
- Content errors: missing/unreadable assets, invalid references, unsupported media, and runtime data issues.

v0 error output is intentionally minimal:

- emit all failures to `console.error()`;
- append failures to `movi.log`.

UI error surfaces beyond console/log are deferred until after the first vertical slice.

Error entries should include file path, line/column when available, category, code, message, and suggested fix.

- No silent no-ops for broken invariants.
- Every async workspace operation needs explicit error boundaries.
- Missing required objects/methods must throw descriptive exceptions.
- Internal recovery may continue later work but must not hide original failure.

Logging:

- Each plugin load appends a new run header to `movi/movi.log` (blank line, timestamp, blank line).
- Each reported error appends timestamp, operation context, category/code, message, and stack if available.
- `movi.log` is trimmed on each append to a small configurable cap (default 6 KB), keeping the newest entries and trimming at a newline boundary.
- If log writing fails, report only via `console.error()` and never recurse.
- Runtime logs must be Git-ignored.

## Smoke test architecture (v0)

movi uses a built-in, dependency-free smoke test harness.

- Test entry point: `Movi.Test.runAll()`.
- Trigger path: an Obsidian command (for example, “movi Run Smoke Tests”).
- Result shape: pass/fail counts plus per-case diagnostics.

v0 suites:

- Logger smoke tests
- Parser smoke tests

Test style:

- Table-driven cases (`name`, `input`, `expected`).
- Minimal assertion helpers (`assertEqual`, `assertTrue`, `assertContains`).
- Deterministic behavior only; no network or non-deterministic dependencies.

Output policy follows v0 error policy:

- concise summary to console;
- detailed diagnostics to `movi.log` (with normal log trimming).

Minimum v0 coverage:

- logger append behavior;
- logger trim-to-cap behavior (including newline-safe trim);
- parser `# Script` section discovery;
- parser happy-path single-command parse;
- parser error classification and line/column/code diagnostics.

## Architectural invariants

- Plain JavaScript with minimal concat/copy build.
- `Movi`/`register()` exist before all registrations.
- One registration scope per source file.
- No accidental globals.
- No hidden filename-order dependencies in ordinary source files.
- Markdown script is the source of truth.
- Parsing, timeline, rendering, audio, and Obsidian integration remain separated.
- DOM/Canvas are never authoritative state.
- One playback clock governs all timed systems.
- Player open/reuse follows one common lifecycle path.
- Browser-compatible and Obsidian APIs are required; Node/Electron/desktop-only APIs are prohibited.
- Errors are visible, persistent, descriptive, and logged.
