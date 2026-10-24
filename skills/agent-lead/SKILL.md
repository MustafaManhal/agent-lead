---
name: agent-lead
description: Lead another coding agent CLI as your implementer (agy, Codex, Gemini CLI, Qwen Code, OpenCode, Cursor Agent, a second Claude Code, Aider, or any other CLI agent) while you plan, brief, review and land the work, and the user watches it live in the /agent pane. Use when the user says things like "have codex build X", "let gemini do it and you review", "use <cli> as the worker, you are the boss", or wants to set up that workflow. Do not use for work small enough to do inline.
---

# Leading a coding agent CLI

Full reference (data flow, every supported event format, how the pane works, gotchas): `AGENTS.md` at this plugin's root, two folders up from this file.

Three roles:

- **The worker**: any coding agent CLI the user picks. It writes code and runs only what it is allowed to. It never commits, pushes or merges.
- **You, the lead**: plan the work, write the brief, review every change yourself, send fixes back, land the result.
- **The user**: watches every step in the `/agent` pane and has the last word on design decisions and on anything that ships.

## Setup: once per machine, never per project or session

Check: `test -x ~/.claude/agent-runs/agent-run && echo ready`. If it is not ready, ask the user to run this once themselves (it edits their settings, so it must be them, not you), then restart Claude Code or run `/reload-plugins`:

```
! bash <this skill's folder>/setup.sh
```

It installs `agent-run`, `run-agent.sh` and the worker rules into `~/.claude/agent-runs/`, lets Claude Code run them in every project (user-level allow rules), and adds a safe allow list to the worker CLIs that keep theirs in a file (agy, Cursor Agent). Nothing else needs editing: `agent-run` puts the worker rules in front of every brief and gives each CLI per-run limits (Claude Code and Gemini/Qwen: an allowed-tools list; Codex: the `workspace-write` sandbox; OpenCode: a temporary `opencode.json` removed after the run). A project rules file (`AGENTS.md`, `CLAUDE.md`, …) is optional; the worker follows it when present.

The worker CLI must be installed and signed in; if it is not, tell the user. Do not install or sign in for them.

## The workers

Use `agent-run` for these; the table shows what it runs underneath, for debugging or for running a CLI by hand.

| CLI | Headless run with live events | Follow-up in the same session | Rules file it loads |
| --- | --- | --- | --- |
| agy (Antigravity) | `agy -p "<brief>" --mode accept-edits --output-format stream-json` (add `--remote-control` for its browser view) | `--conversation <conversation_id>` | `AGENTS.md`, `GEMINI.md`, `.agents/rules/*.md` |
| Claude Code | `claude -p "<brief>" --output-format stream-json --verbose --permission-mode acceptEdits` | `--resume <session_id>` | `CLAUDE.md` |
| Codex | `codex exec --json --sandbox workspace-write "<brief>"` | `codex exec resume <thread_id> --json "<fixes>"` | `AGENTS.md` |
| Gemini CLI, Qwen Code | `gemini -p "<brief>" --output-format stream-json --approval-mode auto_edit` (Qwen: `qwen`, same flags) | `--resume latest` | `GEMINI.md` (Qwen: `QWEN.md`) |
| OpenCode | `opencode run --format json --model <provider/model> "<brief>"` (a model is required) | `--session <sessionID>` | `AGENTS.md` |
| Cursor Agent | `cursor-agent -p --trust --output-format stream-json "<brief>"` | `--resume <session_id>` | `AGENTS.md`, `.cursor/rules/` |
| Any other CLI (Aider, Amp, Droid, Copilot CLI, Kimi, Goose, Crush, …) | its print or headless mode; use a JSON stream flag if it has one | its own resume flag | its own convention |

The pane reads all of the formats above. Output it does not recognise, including plain text, still shows line by line, so any CLI works. Check `<cli> --help` when a flag fails: these CLIs change often.

Pick the model with the CLI's model flag when the task is design work or spans many files; a cheap low-effort run once did shallow work and reported changes it never made.

## Each task

1. **Isolate.** Give the worker its own git worktree and branch, never the user's checkout:
   ```bash
   git worktree add ../<repo>-worker -b worker/<task> <working-branch>
   ```
   Install dependencies there yourself (workers should not install), and generate anything the type checker needs (for Next.js: `npx next typegen`). Never copy secrets (`.env.local`) into it.
2. **Brief.** Write it to a file in your scratchpad: the goal, the exact files (and lines where you know them), the expected result, the commands the task needs, and which project docs to read if it needs more context. Be concrete about visuals: tokens, sizes, states, both themes, phone width. The built-in worker rules (`worker-rules.md`, added by `agent-run`) cover the rest.
3. **Run** with the launcher, one command, no `cd` chain:
   ```bash
   ~/.claude/agent-runs/agent-run <cli> <brief-file> --cd ../<repo>-worker [--model <model>]
   ```
   `<cli>` is `agy`, `claude`, `codex`, `gemini`, `qwen`, `opencode` (needs `--model provider/model`) or `cursor`. It prints the last lines of the run and `SESSION <cli> <id>`. For any other CLI: `~/.claude/agent-runs/run-agent.sh <name> <its headless command>` inside the worktree. Extra allowed commands for one run: `AGENT_LEAD_ALLOW="npm run e2e,make check" agent-run …`.
4. **Review, never on the worker's word.** Read `git diff` in the worktree. Check every claim in its report against the files. Run typecheck, lint and build; for UI, screenshots at phone and desktop width in both themes, keyboard focus and an accessibility check; add edge cases it did not test.
5. **Send fixes** to the same session: `agent-run <cli> <fixes-file> --cd <worktree> --resume <id>`, with an exact review (what is wrong, where, what it should be). Fix a one- or two-line nit yourself instead; say so in the commit.
6. **Land.** Commit on the worker branch under the user's identity and conventions, merge into the working branch, remove the worktree and branch. Ship to production only with the user's approval.

## Gotchas

- **One refused command can end a headless run.** The pane marks it `DENIED` in red. Fix the brief or ask the user to allow the command.
- Some workers refuse commands with **square brackets** (`git diff app/[id]/page.tsx`). Tell them to run `git diff` with no path.
- Workers sometimes read files through the shell (`sed`, `cat | …`). The rules template forbids it; keep that line.
- Features that need server keys behave differently in the worktree build (no `.env.local`). Check them in the main checkout after merging.
- Quotas belong to the worker's own account. Check them with the CLI's usage command where it has one (agy: `agy -p "/usage"`).

## Reporting to the user

After each batch: which worker and model ran, what it changed, what you fixed or sent back and why, what you verified and how, what is left, and the quota used if they care. Keep the briefs in the project's docs if they want a record.
