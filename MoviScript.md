## MoviScript v0 (Draft)

Purpose: define an easy-to-author, deterministic movie scripting language that translates cleanly to a future C# Unity runtime.

Authoring priorities:

1. brevity and readability on mobile;
2. deterministic playback and seek behavior;
3. fail-loud ambiguity and error handling.

## File policy

During development, movi accepts script files in either:

- `.md` (current working format), or
- `.ms` (MoviScript format).

The long-term primary format is `.ms` once v0 is stable.

## Block syntax

MoviScript uses Python-style indentation blocks as the standard.

- Block headers end with `:`.
- Nested statements are defined by indentation.
- Braced `{ ... }` blocks are not part of v0.

## Timing model

MoviScript supports two trigger styles:

- `at` for timeline-derived timing;
- `when` for event-derived timing.

Examples:

- `at 12s:`
- `at +2.5s:`
- `at anim:heroMove 40%:`
- `at seq:intro -5s:`
- `when sound:radio.end:`

Guideline:

- prefer `at` for deterministic choreography;
- use `when` when runtime completion events are the real intent.

## Name resolution and brevity rules

Default style is unqualified names (brevity-first).

- `heroMove`
- `radio`
- `intro`

Qualified names are allowed for disambiguation:

- `anim:heroMove`
- `sound:radio`
- `seq:intro`

Resolution rules:

1. If an unqualified name matches exactly one symbol, it is valid.
2. If it matches multiple symbols across kinds, parsing fails with an ambiguity error and requires `kind:name`.
3. Missing names fail with descriptive errors and nearest-name suggestions when available.

## Core v0 command surface

The v0 surface focuses on proving VID-M01 with minimal syntax.

- scenes: `scene`, `goto`, `end`, `clear`
- layers: `image`, `text`, `show`, `hide`, `remove`, `order`, `group`, `ungroup`
- animation: `move`, `scale`, `rotate`, `fade`, `color`
- camera: `pan`, `zoom`, `rotateCamera`, `shake`
- timeline: `wait`, `parallel`, `sequence`, `at`, `when`
- audio: `music`, `sound`, `voice`, `volume`, `stopAudio`
- events: `event`

## Layer coordinate model (v0)

MoviScript layer placement uses three concepts:

- `Q` = anchor point (origin point, such as `screen.center` or `hero.hand`)
- `W` = reference area/dimensions that define percent scale (such as `screen` or `hero.bounds`)
- `(x%, y%)` = offset from `Q`, measured as a percentage of `W`

Canonical interpretation:

- “from `Q`, move by `(x%, y%)` of `W`”

Example forms:

- `place hero at screen.center + (30%, 10%) of screen`
- `place spark at hero.hand + (12%, -5%) of hero.bounds`
- `move cam to screen.center + (0%, -20%) of screen over 2s`

Guidelines:

- Use `%` and named reference areas as the primary coordinate system.
- Allow optional `px` only as a secondary nudge unit.
- Keep anchors nameable and reusable (`screen.center`, `hero.left`, `hero.hand`, etc.).

## Determinism and seek invariants

- Script intent compiles to a timeline/model before playback.
- Renderer does not parse script text during playback.
- One authoritative movie-time clock drives animation, camera, effects, events, and audio.
- Seeking reconstructs state from timeline time, not from irreversible incremental side effects.

## Example (illustrative)

```text
scene intro

image bg = "VID-M01-001.png"
image hero = "VID-M01-hero.png"

anim heroMove:
  move hero to screen.center + (10%, -5%) of screen over 8s ease inOut

sound radio = "VID-M01-radio.ogg"

at anim:heroMove 40%:
  text caption "Something changes here"

when sound:radio.end:
  goto next
```

## Parser strategy recommendation

Use a small hand-written parser in both JavaScript and C#:

1. line-aware lexer/tokenizer;
2. indentation tokenization (`INDENT`/`DEDENT`/`NEWLINE`);
3. recursive-descent parser (LL-style);
4. semantic resolution pass (symbols, ambiguity, references);
5. lowering pass to an engine-neutral timeline model.

Why this is preferred:

- no generator toolchain or extra build dependencies;
- easy parity across JS and C#;
- simple to debug on Android;
- best control over explicit, human-readable errors.

## MoviScript v0 grammar contract (parser-facing)

This section defines the minimum contract for interoperable parsers and AI-assisted authoring.

### 1) Lexical and indentation rules

- UTF-8 text.
- Newline-delimited statements.
- Comments begin with `#` and run to end-of-line.
- Block headers end with `:` and require one indented child block.
- Indentation uses spaces only in v0 (2 spaces recommended).
- Mixed tabs/spaces is a hard syntax error.
- Dedent must match a previous indent level exactly.

### 2) Identifier rules

- Case-sensitive identifiers.
- Identifier pattern: `[A-Za-z_][A-Za-z0-9_]*`.
- Dotted anchors are allowed: `hero.hand`, `screen.center`, `hero.bounds`.
- Optional kind-qualified references are allowed: `kind:name` (for example `anim:heroMove`).

### 3) Primitive literals and units

- Time literals: `<number>s` (for example `0.5s`, `12s`).
- Percent literals: `<number>%` (for example `40%`, `-10%`).
- Optional pixel literal: `<number>px`.
- Numbers are decimal; integer and float forms are both valid.

### 4) Core statement shapes

Top-level statements:

- `scene <name>`
- asset/layer declarations (`image`, `text`, `music`, `sound`, `voice`)
- event/action invocations (`move`, `scale`, `rotate`, `fade`, `color`, `pan`, `zoom`, `rotateCamera`, `shake`, `show`, `hide`, `remove`, `order`, `group`, `ungroup`, `volume`, `stopAudio`, `goto`, `clear`, `end`, `event`)
- block forms: `anim <name>:`, `sequence <name>:`, `parallel <name>:`, `at <timing-ref>:`, `when <event-ref>:`

Timing references must support at least:

- absolute: `12s`
- relative: `+2.5s`
- progress: `<ref> <percent>` (for example `anim:heroMove 40%`)
- end-relative: `<ref> -<time>` (for example `seq:intro -5s`)

### 5) Layer coordinate contract

Canonical placement expression:

- `<anchor> + (<x>, <y>) of <reference>`

Where:

- anchor = `Q` (origin point)
- reference = `W` (scale reference)
- offset = `(x, y)` with `%` as preferred unit

Examples:

- `screen.center + (30%, 10%) of screen`
- `hero.hand + (12%, -5%) of hero.bounds`

### 6) Name resolution contract

- Unqualified names are allowed and preferred for brevity.
- If a name resolves uniquely, it is valid.
- If ambiguous across symbol kinds, parser must fail and require `kind:name`.
- Undefined names are hard errors.

### 7) Error reporting contract (strict requirement)

Every parse/semantic error must include:

- file name;
- 1-based line number;
- 1-based column;
- error category (`Lex`, `Syntax`, `Semantic`);
- short machine-readable code (for example `MSYN001`);
- human message in plain language;
- one-line source excerpt;
- suggested fix when available.

Error message style should be explicit and actionable, for example:

- `Ambiguous reference 'intro' (matches scene:intro, seq:intro). Use kind:name.`
- `Invalid indent at line 42: expected 2 spaces deeper after 'at ...:'`.

### 8) AI-authoring compatibility rules

To keep AI generation/revision reliable:

- prefer one statement per line;
- keep command forms regular and low-variance;
- avoid context-sensitive shorthand in v0;
- prefer explicit units (`s`, `%`, `px`);
- require colon block headers consistently.

## Out of scope for v0

- full formal grammar notation;
- advanced macro/template systems;
- timeline editor requirements;
- export/render-to-video pipeline semantics.
