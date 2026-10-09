## Overview

movi: Obsidian plugin that plays still-image movies from `# Script` sections (MoviScript) in `canvid/` notes.
- Language: `MoviScript.md` (what runs today). Playback internals: `playbackDesign.md`. Planned work: `PLAN.md`.
- Explicit, deterministic, timeline-based. Fail loud with Parser/Content errors.
- Markdown script is the source of truth; the renderer never parses markdown.
- Long-term target: Unity VR port (movies projected in-world by a projectorBot). Keep script semantics, playback state, and rendering separate.

## Conventions

- Develop against real data, starting with VID-M01. Working script: `canvid/VID-M01-SCRIPT.md`.
- Assets: flat in `canvid/`, PNGs generated from `.md` specs.
- Scripts may be `.md` or `.ms`; `.ms` is the long-term extension.
- Optional sidecars: `<image>.marks.json` from gptviz `# Mark`.
