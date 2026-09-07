## Purpose
Define movi playback-time architecture for deterministic playback and reliable scrubbing/seek.

## Design choice
movi uses compiled timeline data structures, not full per-frame precomputation and not silent replay-from-start seek.

Rationale:
- Supports random-access seek with correct state reconstruction.
- Resolves relative timing expressions (for example, "when X ends") once at compile time.
- Preserves deterministic behavior under play, pause, restart, and scrub.
- Fits Android/Obsidian memory constraints better than storing every frame state.

## Core runtime model
### 1) CompiledMovieTimeline (authoritative, immutable)
Fields:
- durationMs
- tracks (image/layer/camera/audio/effects)
- actions/segments sorted by start time
- resolved timing dependencies and normalized timestamps

Each segment stores:
- startMs, endMs
- from/to values
- easing
- references needed for dependency tracing/debug

### 2) RuntimeState (authoritative current state, mutable)
Fields:
- playheadMs
- layer state map (visibility, source, transform, alpha, etc.)
- camera state
- audio/effect state
- active segment cursors for fast tick evaluation

Renderer reads RuntimeState; renderer does not parse script.

### 3) SnapshotIndex (sparse seek accelerator)
Fields:
- snapshotIntervalMs (recommended: 250ms to 500ms)
- snapshots: map from time to resolved full RuntimeState clone

Seek algorithm:
1. clamp target time
2. load nearest snapshot <= target
3. apply only timeline segments between snapshot and target
4. write resolved state into RuntimeState

### 4) Optional short-lived FrameCache
A tiny LRU cache of recently resolved playhead states to smooth local scrub back/forth.

## Timing and dependency resolution
During compile:
- Resolve all relative timing references into absolute ms.
- Build deterministic ordering for equal-time events.
- Validate unresolved or circular timing references as parser/content failures with location context.

## Playback/seek invariants
- One authoritative playback clock.
- Seeking reconstructs state from timeline + snapshot, not from irreversible side effects.
- Pause/resume preserves intra-segment progress.
- Restart resets to time 0 deterministic baseline.

## Non-goals for this phase
- Full offline per-frame materialization.
- Video export pipeline replacement.
- Heavy optimization beyond simple snapshot + incremental application.

## Implementation notes for current movi
- Keep parser/runtime/view separation aligned with ARCH.md.
- Keep data structures plain JavaScript and Android-compatible.
- Fail loudly via existing parser/content error policy and movi.log logging.
