# Notes for agents: how agent-lead works

You are probably the lead agent: the coding agent in the user's main session. This file explains the whole system so you can run it, fix it, or extend it to a new CLI without guessing. The operating procedure is the skill (`skills/agent-lead/SKILL.md`); this is the reference behind it.

## The parts

| Part | Where | Job |
| --- | --- | --- |
| The worker | any coding agent CLI (agy, Claude Code, Codex, Gemini CLI, Qwen Code, OpenCode, Cursor Agent, Aider, …) | Implementer. Writes code, runs allow-listed commands. Never commits. |
| You, the lead | the user's coding session | Plan, brief, review, send fixes, land. |
| The user | watching | Approves design decisions and anything that ships. |
| Skill `agent-lead` | `skills/agent-lead/SKILL.md` | The procedure, and the per-CLI command table. |
| Launcher | `skills/agent-lead/agent-run`, installed to `~/.claude/agent-runs/agent-run` | For the known CLIs: builds the headless command with its stream flag, puts `worker-rules.md` in front of the brief, applies per-run limits, calls the wrapper, prints `SESSION <cli> <id>`. |
| Run wrapper | `skills/agent-lead/run-agent.sh`, installed to `~/.claude/agent-runs/run-agent.sh` | Runs any CLI, frames its output with start/end lines, writes the live log. |
| Setup | `skills/agent-lead/setup.sh`, run once per machine by the user | Installs the scripts, adds user-level Claude Code allow rules for them, adds the safe set to agy's and Cursor's allow-list files. Idempotent, backs up what it changes. |
| Pane `/agent` (alias `/agy`) | `hooks/register.tsx` + `hooks/parse.ts` | Live view of the run beside the chat. |
| Worker rules | `skills/agent-lead/worker-rules.md`, prepended to every new brief by `agent-run` | Role, allowed commands, no shell file reading, no commits, report format. A project rules file (template `templates/AGENTS.md`) is optional extra context. |
| Per-run limits | built into `agent-run` | Claude Code `--allowedTools`, Gemini/Qwen `--allowed-tools`, Codex `--sandbox workspace-write`, OpenCode a temporary `opencode.json` (deleted on exit), agy and Cursor their allow-list files from setup. |

## Data flow of one run

```
lead writes brief.md
  └─> agent-run <cli> brief.md --cd <worktree> [--model m] [--resume id]
        ├─ prompt = worker-rules.md + brief (a --resume run sends only the brief)
        ├─ builds the CLI's headless command with its JSON stream flag and per-run limits
        └─> run-agent.sh <cli> <command…>
              ├─ writes {"lead":"start","agent","cwd","at"}             ┐
              ├─ every line the CLI prints (stdout + stderr)            ├─> ~/.claude/agent-runs/live.log ──> /agent pane (reads it every 1 s)
              └─ writes {"lead":"end","code","at"}, exits with the code ┘
        └─> prints the last lines and "SESSION <cli> <id>" to the lead
lead reviews the worktree diff ──> fixes: agent-run <cli> fixes.md --cd <worktree> --resume <id> ──> lead commits, merges, removes the worktree
```

The log is overwritten by each run, so the pane shows one run at a time. `AGENT_LEAD_LOG` changes the path (the pane only reads the default path and the old `~/.claude/agy-runs/live.ndjson`). `AGENT_LEAD_TAIL` changes how many lines the wrapper prints back.

## Event formats the pane reads (`hooks/parse.ts`)

Every line is tried against these readers in order; the first that claims it wins. A JSON line nobody claims, and any non-JSON line, goes to the plain log.

| Reader | How it recognises a line | Steps (tool rows) | Reply text | End of run |
| --- | --- | --- | --- | --- |
| Lead markers | `lead: "start" \| "end"` | — | — | `end` sets status done, exit code, seconds |
| agy | `event: init \| step_update \| result` | `step_update` with `step_type: tool`, keyed by `step_index`; state `ACTIVE/DONE/ERROR`; `tool_info.parameters`; `denied permission` → DENIED; `exited with code N` → exit note | `text_delta` joined per step | `result` (`usage.total_tokens`, `duration_seconds`, `denied_actions`) |
| Codex | `type` starts with `thread.`, `turn.`, `item.` (or `error` with `message`) | `item.*` for `command_execution` (shell, `exit_code`, `declined` → DENIED), `file_change` (paths), `mcp_tool_call`, `web_search` | `agent_message` items | `turn.completed` (`usage`) |
| Cursor Agent | `type: tool_call` | `tool_call.<name>ToolCall.args`, `subtype started/completed`, `result.error/rejected` | its `assistant` lines go to the Claude reader | `result` (`duration_ms`) |
| Claude Code (and Claude-shaped CLIs) | `type: system \| assistant \| user \| result` | `tool_use` blocks, closed by `tool_result` (`is_error`) | `text` blocks | `result` (`usage`, `duration_ms`, `permission_denials`); `claude_code_version` in init tells Claude from Cursor |
| Gemini CLI, Qwen Code | `type: init` with `session_id`, `message` with `role`, `tool_use` with `tool_name`, `tool_result` with `tool_id`, `error` with `severity`, `result` with `stats` | `tool_use` / `tool_result` by `tool_id` | assistant `message` deltas joined until the next tool | `result` (`stats.total_tokens`, `stats.duration_ms`) |
| OpenCode | has `part` (or `type: error` with `sessionID`) | `part.type: tool`, `state.status pending/running/completed/error`, `state.metadata.metadata.exit` | `part.type: text` | no final event: the wrapper's end line marks it; `step-finish` adds tokens |
| Plain text | anything else | — | — | shown as the log (last 200 lines, colour codes removed) |

Denials: any error text matching `denied|not allowed|permission|rejected|declined|blocked by` is shown as `DENIED` and counted.

**Adding a new CLI**: capture one real run (`<cli> <headless flags> > sample.ndjson`), write a `readX(run, e)` that returns `true` for lines it owns and calls `setStep`, `addReply` and `addLog`, add it to `READERS` before any reader that would claim its lines, and run the parser over the sample (for example with `npx tsx`). Keep readers strict about what they claim, or they steal other formats' lines.

## How the pane works (`hooks/register.tsx`)

- **On session start**: registers `/agent` and `/agy`, reads `$HOME` once, starts a 1-second timer.
- **Each tick**: picks the newest of the log files, and if its `mtime` changed reads it (4 MiB limit), runs `parseRun`, and stores the view in one state value (`atom` key `view`, shape tag `view-2`; type `AgentView` in `types/index.d.ts`). An overlap guard skips a tick while the previous read runs. A run with no end line and no final event for 120 s counts as ended.
- **Auto-open**: when the status changes to `running`.
- **Drawing**: a header (`● <agent> running <folder>` in amber, or `■ <agent> done <folder> <seconds · tokens · exit>` in green, red for a non-zero exit), the session id and denied count, one row per tool step (`✔`, `…` amber, `✖` red with the note), or the plain log for CLIs without steps, then the tail of the agent's reply. Rows are cut to the pane's height.

**Changing it**: edit `hooks/parse.ts` or `hooks/register.tsx`; when `AgentView` changes, update `types/index.d.ts` and bump the atom's `shape` tag so old stored values are dropped; run `claude plugin validate .`.

## Allow lists (learned the hard way)

- Setup is once per machine (`setup.sh`, run by the user); nothing per project or session. Claude Code's auto mode refuses to edit settings or agent allow lists itself, which is why the user runs it.
- Verified: OpenCode ignores permissions passed through `OPENCODE_CONFIG` or `OPENCODE_CONFIG_CONTENT` but honours an `opencode.json` in the run folder, so `agent-run` writes one there for the run and deletes it on exit (it leaves an existing one alone).

- Headless workers cannot ask. Anything not allowed is refused, and on some CLIs (agy) one refusal ends the run.
- Prefer allow lists to "approve everything" switches (`--force`, `yolo`, `--dangerously-skip-permissions`, `danger-full-access`). Never use those for a worker.
- Some CLIs refuse commands with square brackets even when allowed (`git diff app/[id]/page.tsx`): tell the worker to run `git diff` without a path.
- Workers sometimes read files through the shell (`sed`, `python`); the rules template forbids it.

## Quotas and models

- Each worker spends its own account's quota. agy: `agy -p "/usage"`. Others: their own usage page or command.
- Use the CLI's model flag for design or multi-file work. A run with 0 reasoning tokens on a low setting once did shallow work and reported changes it never made.

## Review checklist (never take the worker's report on trust)

1. `git diff` in the worktree: every change in scope, nothing extra, no hard-coded colors, nothing focusable in decorative markup.
2. Typecheck, lint, build.
3. For UI: screenshots at phone and desktop width, light and dark, keyboard focus, an accessibility check, the edge cases the worker did not test.
4. Compare each claim in the report with the diff.
5. Fix one- or two-line nits yourself; send anything bigger back to the same session.

## Gotchas

- Your shell may return to the repo root after each command: always `cd <worktree> && run-agent.sh …` in one command, or the worker runs in the user's checkout.
- A fresh worktree may lack generated files the type checker needs (Next.js: `npx next typegen`).
- No `.env.local` in the worktree; features that need server keys differ there. Check them in the main checkout after merging.
- Claude Code's auto mode may refuse to launch a worker or to edit a worker's settings until the user allows it; explain and let the user decide.
- Some CLIs read stdin and wait; the wrapper closes stdin for them.
