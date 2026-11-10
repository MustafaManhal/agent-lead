# Codex adapter

Codex uses the same briefs, reports, review loop, six docs, checklist and project playbook as Claude Code.
In the desktop app, type `/lead` and select Lead from the slash menu. Enabled skills appear in that menu;
the installed short `lead` alias supplies the bare name. `/agent` selects the worker-status skill in the same
way. CLI/IDE users can invoke `$lead`, `$agent`, or `$agent-lead` for the full procedure.
The plugin also exposes qualified skills (`agent-lead:lead`, `agent-lead:agent`, `agent-lead:agent-lead`).
These are skill entries in the host's menu, rather than Claude's command-registration API.

## Setup

The Codex plugin bundles `lead`, `agent`, and `agent-lead`. Its trusted SessionStart hook installs the short
skill aliases under `~/.agents/skills/` and worker tools under `~/.codex/agent-runs/` (or `$CODEX_HOME/agent-runs/`).
If hooks are unavailable or untrusted, run:

```bash
node <agent-lead skill>/install-codex.mjs --skills
```

The same command works for a standalone installation from a repo clone. Existing changed files get a
`.bak-agent-lead` backup. Setup is safe to repeat after an
update. It never changes Codex approval policy, Claude settings, or other worker CLIs' allow lists.

Node.js 22.18 or newer is required for the status viewer, which shares Claude's TypeScript event parser.
Worker CLIs must already be installed and signed in. If agy or Cursor needs allow-list setup, use the worker's
normal permission flow; do not run Claude's `setup.sh` from Codex.

## Choose the workflow

Ask on the first `/lead` or `$lead` in a project, or when the user asks to switch (otherwise use LEAD.md's mode):

- **Handoff**: the user launches the worker and pastes the brief prompt.
- **Launched worker (Pane in the shared playbook)**: Codex runs `agent-run`; the user watches a terminal viewer.

Record the latter as `Pane` in LEAD.md for compatibility, with `Lead host: Codex` and the launcher and log paths.
The user still chooses the worker and model. Do not launch a worker before that choice.

```bash
~/.codex/agent-runs/agent-run codex /absolute/brief.md --cd /absolute/worker-checkout
~/.codex/agent-runs/agent-run codex /absolute/review-round.md --cd /absolute/worker-checkout --resume <session-id>
node ~/.codex/agent-runs/agent-view.mjs --json
```

Use the configured `$CODEX_HOME` path when present. The Codex launcher sets a separate Codex log by default;
`AGENT_LEAD_LOG` can select another file. Runs retain the shared launcher's per-run limits and report contract.
Read `pane.md` for the item and review loop, replacing Claude's paths with the Codex paths above. If a refusal
requires permission changes, explain the exact command and let the user's normal approval controls handle it.

## Status and UI

`$agent` returns the parsed run in the conversation. The terminal command below refreshes once a second until
Ctrl-C and shows steps, denied calls, reply, session ID, tokens, elapsed time and exit code:

```bash
node ~/.codex/agent-runs/agent-view.mjs --watch
```

Closing the viewer leaves the worker running. `AGENT_LEAD_LOG` or `--log <path>` selects a different log.
Use the session's question tool when available. Keep the checklist as a local HTML file unless the user has
authorized publishing through an available artifact/hosting tool. Never claim a Claude pane or Artifact tool
exists in Codex.
