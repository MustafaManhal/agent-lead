# Notes for agents: how agy-lead works

You are probably the lead agent: the coding agent in the user's main session. This file explains the whole system so you can run it, fix it, or extend it without guessing. The short operating procedure is the skill (`skills/agy-lead/SKILL.md`); this is the reference behind it.

## The parts

| Part | Where | Job |
| --- | --- | --- |
| agy (Antigravity CLI) | `agy` on PATH | Implementer. Writes code, runs allow-listed commands. Never commits. |
| You, the lead | the user's coding session | Plan, brief, review, send fixes, land. |
| The user | watching | Approves design decisions and anything that ships. |
| Skill `agy-lead` | `skills/agy-lead/SKILL.md` | The procedure you follow. |
| Pane `/agy` | `hooks/register.tsx` | Live view of agy's run beside the chat. |
| Rules file | `.agents/rules/AGENTS.md` in the target repo (template in `skills/agy-lead/templates/`) | Loaded by agy on every run: project, style, allowed commands, report format. |
| Allow list | `~/.gemini/antigravity-cli/settings.json` → `permissions.allow` | The only commands headless agy may run. Only the user edits it. |
| Remote Control | `agy remote-control start --session --name <machine>` | agy's own browser view at https://antigravity.google.com. |

## Data flow of one run

```
lead writes brief ──> agy -p "<brief>" --output-format stream-json ──┬──> tee ~/.claude/agy-runs/live.ndjson ──> /agy pane (polls every 1s)
                       (in a git worktree, on branch agy/<task>)       └──> grep '"event":"result"' ──> lead reads the result line
                                         │
                                         └──> --remote-control ──> agy's browser view
lead reviews the worktree diff ──> fixes: same command + --conversation <id> ──> lead commits, merges, removes the worktree
```

## agy's stream-json format (what the pane parses)

One JSON object per line. The pane relies on these fields only:

- `{"event":"init","conversation_id":"…","init":{"cwd":"…","tools":[…]}}`: first line of a run.
- `{"event":"step_update","step_update":{…}}`, where `step_update` has:
  - `step_index` (number), `step_type` (`user_input`, `agent_response` or `tool`), `state` (`ACTIVE`, `DONE` or `ERROR`).
  - For tools: `tool_name` (`read_file`, `write_to_file`, `run_command`, …) and `tool_info.parameters` (`CommandLine`, `TargetFile`, `Path`, …). On `DONE`, `tool_info.output` (commands start with `Command exited with code N.`). On `ERROR`, `tool_info.error.message`; a refused command contains `denied permission`.
  - For replies: `text_delta`, a piece of agy's answer; pieces of one `step_index` concatenate.
  - `usage` on finished responses: `input_tokens`, `output_tokens`, `thinking_tokens`, `cache_read_tokens`, `total_tokens`.
- `{"event":"result","result":{"conversation_id","status","response","duration_seconds","num_turns","usage","denied_actions"}}`: last line. `denied_actions` is non-empty when a command was refused.

Without `--output-format stream-json`, `agy -p` prints only the final text, and the pane shows nothing.

## How the pane works (`hooks/register.tsx`)

- **On session start** it registers the `/agy` command, reads `$HOME` once (`$.process.run(['printenv','HOME'])`), and starts a 1-second timer (`$.clock.every`).
- **Each tick**: if `~/.claude/agy-runs/live.ndjson` exists and its `mtime` changed, it reads the whole file (`$.fs.read`, 4 MiB limit), parses every line, and stores the result in one state value (`atom` key `view`, shape tag `view-1`; type `AgyView` in `types/index.d.ts`). An overlap guard skips a tick while the previous one is still reading.
- **The parse** (`parse()`): tool steps become rows `{index, tool, target, state, note}`. The target is the first known parameter, with paths shortened relative to `cwd`. The note is `exit N`, `DENIED`, or the first line of an error. Reply deltas are joined per step and the last reply wins. The `result` line sets status `done`, seconds, total tokens and the denied count. A run with no `result` line for 120 s is treated as ended.
- **Auto-open**: the pane opens by itself when the status changes to `running`, so follow-up rounds of the same conversation open it too.
- **Drawing** (`ui.render` on `Pane`): a header (`● running` or `■ done` with folder, seconds and tokens), the conversation id and denied count, then one row per tool step (`✔`, `…` in amber, `✖` in red), then the tail of agy's reply. Rows are cut to the pane's height.

Limits worth knowing: it shows one run at a time (each run overwrites `live.ndjson`); runs not piped through `tee` to that path are invisible to it; a run file over 4 MiB cannot be read; the pane draws in Claude Code terminal and desktop sessions.

**Changing it**: edit `hooks/register.tsx`, bump the atom's `shape` tag when you change the `AgyView` fields (old stored values are then dropped), keep `types/index.d.ts` in step, and run `claude plugin validate .` before committing.

## Allow list rules (learned the hard way)

- Headless agy cannot ask for permission. Anything not allowed is refused, and **one refused command ends the whole run** (`jetski: no output produced …`).
- A rule `command(ls)` also allows `ls -la`: it matches the command and any arguments.
- Commands containing square brackets are refused even if allowed: `git diff app/[id]/page.tsx`. Tell agy to run `git diff` with no path.
- agy sometimes tries `sed`, `cat | …` or `python` to read files. The rules file forbids reading through the shell; keep that line.
- Never add destructive or outward commands: `rm`, `mv`, `git push/commit/merge/checkout`, `npm install`, `npx`, `curl`, plain `node <file>`.
- `--mode auto` is not available on every account; do not count on it.

## Quotas and models

- `agy -p "/usage"` shows the weekly quota left per model pool (for example a Gemini pool and a Claude/GPT pool), with reset times. It starts no agent turn.
- When one pool runs low, pass `--model` with a model from the other pool (`agy models` lists them).
- Watch `thinking_tokens` in the result: a run with 0 on a low setting once did shallow work and reported changes it never made. For design or multi-file work, name a stronger model.
- A typical five-fix batch costs 40k to 300k agy tokens depending on the model.

## Review checklist (never take agy's report on trust)

1. `git diff` in the worktree: every change in scope, nothing extra, no hard-coded colors, nothing focusable in decorative markup.
2. Typecheck, lint, build.
3. For UI: screenshots at phone and desktop width, light and dark, keyboard focus, an accessibility check (axe), and the edge cases agy did not test.
4. Compare each claim in agy's report with the diff.
5. Fix one- or two-line nits yourself (cheaper than another run); send anything bigger back with `--conversation <id>`.

## Gotchas

- Your shell may return to the repo root after each command, so always `cd <worktree> && agy …` in one command, or agy runs in the user's checkout.
- A fresh worktree may lack generated files the type checker needs (for Next.js run `npx next typegen` after installing).
- The worktree has no `.env.local`; never copy secrets there. Features that need server keys behave differently in its build; check them in the main checkout after merging.
- Auto mode in Claude Code may refuse to launch agy or to edit agy's settings until the user allows it; explain and let the user decide.
