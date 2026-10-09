{#include ../canvid/SharedProjects.md}


Quick context (always load):
- {#include ARCH.md#Overview}
- {#include SPEC.md#Overview}

Full-read policy for editing movi:
- Read full ARCH.md for architecture, plugin-load behavior, split/build workflow, runtime boundaries, player-view lifecycle, timeline model, or subsystem-boundary changes.
- Read full SPEC.md for scope and contracts; PLAN.md for planned work.
- Read full MoviScript.md for script syntax, parser/semantic rules, naming/disambiguation, timing forms, or authoring-convention changes.
- If scope is unclear or quick context is insufficient, read all three full files before editing.

Core rules:
- Make only the requested change.
- Preserve behavior unless the request requires change.
- Keep implementation minimal and practical.
- Keep code Android-compatible with Obsidian mobile.
- Use Obsidian APIs, not Node/Electron APIs.
- Never expose, log, or store API keys outside Obsidian SecretStorage.
- Code is the source of truth for implemented behavior; do not describe it in docs. Edit PLAN.md only when asked.

Scripts and build workflow:
- Run scripts as bash script.sh (not ./script.sh).
- Assume all movi .sh scripts run from cwd = movi/.
- Run build.sh after code changes so the user can test.

Vault visibility constraint:
- The vault has a plugin that allows opening/editing arbitrary extensions.
- The vault view does not include anything under .obsidian/; do not assume installed-plugin files there can be read/searched/verified through vault tools.

Editing hygiene:
- Prefer narrow replacements/insertions and re-read affected files after multi-step edits.
- Preserve existing command registrations unless the change requires otherwise.
- Keep declarations/usages consistent and patterns simple/verified.

Vault tooling note:
- The root .gitignore includes *.log and is not reliably editable via vault tools; if that file must change, ask the user to do that step directly.