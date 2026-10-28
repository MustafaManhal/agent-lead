# Tools for the lead and the worker

Small command-line tools in `<skill>/tools/` that make the item loop cheap and repeatable in any project. Each one
prints a few lines, not pages, so they save tokens as well as time. They run from anywhere inside the project (the
git top level is the project root) and read one optional settings file, `.agent-lead/config.json`. Without it they
detect what they need: the plan file, and the checks from `package.json` scripts, `tsconfig.json`,
`pyproject.toml`, `Cargo.toml` or `go.mod`.

`<skill>` is this skill's folder: `~/.claude/plugins/cache/agent-lead/agent-lead/<version>/skills/agent-lead` in
Claude Code, `~/.agents/skills/agent-lead` when installed for Codex, Gemini CLI, OpenCode or Cursor (README).
Write the full path into the project's LEAD.md and briefs (section 4, Commands), so workers can run them too.

## Setup in a project (once, during project setup)

1. Run `node <skill>/tools/check.mjs`. If it finds the right checks, nothing else is needed.
2. Otherwise copy `tools/config.example.json` to `.agent-lead/config.json` and keep only the keys that differ from
   the defaults: `plan`, `checks` (each `{ "name", "run" }`), `page` (checklist page title, lede, `sections`),
   `commitPaths`, `progressLog`, `notes` and `sources` (folders `next.mjs` searches), `devUrl`, `reference` (the
   product being matched), `locks`. Commit it: it is project knowledge, not a secret.
3. Put the commands in LEAD.md section 4.

## The item loop

| Tool | What it does |
| --- | --- |
| `next.mjs [--all]` | The first item not done, in plan order, its first open part, and the notes and source files that mention its key words, ranked. Run it before writing a brief. |
| `check.mjs [--only a,b]` | Runs the project's checks and prints `OK types · lint · tests 412 passed`, or the first errors of each failing check. The worker runs it before reporting; the lead before every commit. |
| `done.mjs "<item text>" [--status x\|~] [--note …] [--log …]` | Marks an item or part in the plan, adds a note line, logs it, rebuilds the checklist page. |
| `ship.mjs "<item text>" "<subject>" [--coauthor "Name <email>"]` | Checks, marks the plan, rebuilds the page and commits in one step; stops if a check fails. Trailers also come from `$AGENT_LEAD_COAUTHOR` and the lead's `$AGENT_LEAD_ATTRIBUTION`. `--no-plan "<subject>"` commits without a plan change. |
| `land.mjs <branch> [--abort]` | Merges the worker's branch into the lead branch; runs the checks on a clean merge, or prints every conflict compactly (file, line, ours, theirs) for one-pass resolution. |
| `../plan-page.mjs` | Builds the checklist page (`checklist-page.md`); `done` and `ship` call it for you. |

## Reading and editing code cheaply

| Tool | What it does |
| --- | --- |
| `outline.mjs <file> [--all] [--grep re]` | Declarations with line ranges (JS/TS, Python, Go, Rust, Swift, Kotlin), or numbered matching lines. Read only the ranges you need. |
| `show.mjs <file> <name>… [--head N]` | Prints one declaration by name, with line numbers. |
| `rep.mjs <file> A-B < new.txt` | Replaces lines A..B with stdin (`A+` inserts, `--delete` removes, `--expect "text"` guards stale line numbers). |
| `snippet.mjs '<code>'` | Runs a TypeScript snippet against the source through Vitest and prints what it logs or returns. |

## Seeing the app and the product being matched

| Tool | What it does |
| --- | --- |
| `play.mjs [--url u] [--ready js] step…` | Drives the running app with real pointer and keyboard input through Playwright: `js:`, `click:`, `drag:`, `move:`, `key:`, `type:`, `tap:role:name`, `text:`, `ui`, `wait:`, `shot:`. Fresh browser each run; prints page errors. |
| `observe.mjs start` then `observe.mjs step…` | A browser that stays open on a reference product, with its own profile (a sign-in the user does once is kept): `ui`, `aria`, `measure:`, `tap:`, `hover:`, `menu:`, `pick:`, `fill:`, `shot:`, `shotui:`, `js:` and real input. Steps refuse to run once the tab leaves the reference site. `endpoint` prints the CDP address for other tools. |
| `measure.js` | Browser snippet behind `observe`'s `measure:` step: `measureUI(label)` (sizes, colors, radii, fonts around a label) and `uiMap()` (every control as text). Paste it into any page's console too. |
| `audit-ui.mjs [--url u] [--routes "/,/x"] [--dark]` | Overflow at nine widths (320–1440 px), tap targets under 44 px on a phone, and rendered text contrast under WCAG AA, on every route. Needs only Chrome. |
| `macos/windows.swift "<app>"` | An app's windows (pid, id, title, frame) as JSON lines. |
| `macos/input.swift --pid <pid> click\|drag\|key …` | Real input for native and Electron apps; refuses unless that app is frontmost. |
| `macos/clip.swift set\|get\|types` | The clipboard as HTML or text, to check copy and paste between your app and another. |
| `macos/ax-enable.swift <pid>` | Turns on an Electron app's accessibility tree so tools can read and press its controls. |

## Research and shared resources

| Tool | What it does |
| --- | --- |
| `research.py search\|multi\|grep\|read\|note …` | Cheap web research: search, fetch and clean pages into a cache, print only keyword passages; `note` appends a sourced bullet to a notes file. Python standard library only. |
| `ask.mjs "<question>" [--url u] [--file f]` | Hands a small job (summarize a page, draft test data) to a cheaper model: Ollama (cloud or local) or any OpenAI-compatible endpoint, set in `~/.config/agent-lead/llm.env`. Never send secrets or private files. |
| `lock.mjs take\|release\|status <name> <holder>` | A lock for a resource two workers must not share at once (the reference-browser tab, the clipboard, a test database). Put "take the lock, release it when done" in every brief that uses one. |

## Rules

- Tools read and write only inside the project, the plugin's cache folders, `/tmp` and `~/.config/agent-lead`.
- No tool pushes, publishes or signs in. `observe.mjs` never types credentials; the user signs in once in its window.
- Keys live in `~/.config/agent-lead/llm.env` or the environment, never in the repo or a brief.
- A worker may run every tool except `ship.mjs`, `land.mjs` and `done.mjs`, which change the plan or commit. Say so in
  `WORKER.md`.
