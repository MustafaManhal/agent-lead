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

## One-time setup (check each, fix what is missing)

1. **The worker CLI is installed and signed in**: run its `--version`. If not, tell the user; do not install or sign in for them.
2. **The run wrapper**: copy `run-agent.sh` from this skill's folder to `~/.claude/agent-runs/run-agent.sh` and make it executable. It gives every run the same start and end lines, so the pane shows any CLI's name, status and exit code.
3. **You may launch the worker**: an allow rule for the wrapper in the project's `.claude/settings.local.json`, for example `"Bash(/Users/<you>/.claude/agent-runs/run-agent.sh:*)"`. Auto mode may block launching another agent until it exists; if a call is refused, explain and let the user decide.
4. **What the worker may run without asking**: headless workers cannot ask for permission. Set up the worker's own allow list from `templates/allow-lists.md` (one section per CLI). Only the user edits those files; show them what to add.
5. **The worker's rules file**: copy `templates/AGENTS.md` into the project where the worker loads it (see the table below), fill in the project section, and commit it. It is what keeps briefs short.

## The workers

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
2. **Brief.** Write it to a file in your scratchpad: the goal, the exact files (and lines where you know them), the expected result, the commands the task needs, and which project docs to read if it needs more context. Be concrete about visuals: tokens, sizes, states, both themes, phone width. The rules file covers the rest.
3. **Run through the wrapper**, always `cd`-ing in the same command (your shell may return to the repo root after each call):
   ```bash
   cd ../<repo>-worker && ~/.claude/agent-runs/run-agent.sh <cli-name> <headless command from the table>
   ```
   The wrapper prints the last lines of the run; the session id for follow-ups is in the CLI's first or last event (`conversation_id`, `session_id`, `thread_id`, `sessionID`).
4. **Review, never on the worker's word.** Read `git diff` in the worktree. Check every claim in its report against the files. Run typecheck, lint and build; for UI, screenshots at phone and desktop width in both themes, keyboard focus and an accessibility check; add edge cases it did not test.
5. **Send fixes** to the same session with the CLI's follow-up flag and an exact review (what is wrong, where, what it should be). Fix a one- or two-line nit yourself instead; say so in the commit.
6. **Land.** Commit on the worker branch under the user's identity and conventions, merge into the working branch, remove the worktree and branch. Ship to production only with the user's approval.

## Gotchas

- **One refused command can end a headless run.** The pane marks it `DENIED` in red. Fix the brief or ask the user to allow the command.
- Some workers refuse commands with **square brackets** (`git diff app/[id]/page.tsx`). Tell them to run `git diff` with no path.
- Workers sometimes read files through the shell (`sed`, `cat | …`). The rules template forbids it; keep that line.
- Features that need server keys behave differently in the worktree build (no `.env.local`). Check them in the main checkout after merging.
- Quotas belong to the worker's own account. Check them with the CLI's usage command where it has one (agy: `agy -p "/usage"`).

## Reporting to the user

After each batch: which worker and model ran, what it changed, what you fixed or sent back and why, what you verified and how, what is left, and the quota used if they care. Keep the briefs in the project's docs if they want a record.
