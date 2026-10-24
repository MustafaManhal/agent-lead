---
name: agy-lead
description: Lead the Antigravity CLI (agy) as your implementer. Use when the user wants agy to write or fix code while you plan, brief, review and land the work, phrasings like "have agy build X", "let agy do it and you review", "you are the boss, agy works", or when setting up that workflow (allow list, rules file, live pane, remote control). Do not use for work small enough to do inline.
---

# Leading agy

Full reference (data flow, agy's stream-json format, how the `/agy` pane works, allow-list rules, quotas, review checklist): `AGENTS.md` at this plugin's root, two folders up from this file.

Three roles:

- **agy** (the Antigravity CLI) writes the code and runs an allow-listed set of commands. It never commits, pushes or merges.
- **You, the lead**, plan the work, write agy's brief, review every change yourself, send fixes back and land the result.
- **The user** watches everything (the `/agy` pane of this plugin, and agy's own browser view) and has the last word on design decisions and on anything that ships.

## One-time setup (check each, fix what is missing)

1. **agy is installed**: `agy --version`. If not, tell the user to install the Antigravity CLI; do not install it yourself.
2. **You may call agy**: an allow rule for `Bash(agy -p:*)` in the project's `.claude/settings.local.json` (git-ignored). Auto mode may block launching another agent until this rule exists; if a call is refused, explain and let the user decide, do not work around it.
3. **agy's allow list**: headless agy cannot ask for permission, so every command it may run must be listed in `~/.gemini/antigravity-cli/settings.json` under `permissions.allow` as `command(<cmd>)`. A rule matches the command with any arguments. Start from `templates/agy-settings.json` in this skill's folder. Only the user edits this file: show them what to add; auto mode will refuse if you try.
4. **agy's rules file**: agy loads `AGENTS.md`, `GEMINI.md` or `.agents/rules/*.md` from the workspace on every run. Copy `templates/AGENTS.md` to `.agents/rules/AGENTS.md` in the project, fill in the project section, and commit it. This file is what lets briefs stay short.
5. **Live views for the user**:
   - This plugin's pane: the user types `/agy`; it also opens by itself when a run starts. It reads `~/.claude/agy-runs/live.ndjson`, so every run must be piped there (see Run).
   - agy Remote Control in the browser: the user runs `agy remote-control start --session --name <machine-name>` once per login, then opens https://antigravity.google.com and picks that machine.

## Each task

1. **Isolate.** Give agy its own git worktree and branch, never the user's checkout:
   ```bash
   git worktree add ../<repo>-agy -b agy/<task> <working-branch>
   ```
   Install dependencies there yourself (agy cannot install), and generate anything the type checker needs (for Next.js: `npx next typegen`).
2. **Brief.** Write it to a file in your scratchpad. The rules file already covers the project, style, commands and report format, so the brief holds only: the goal, the exact files (and lines where you know them), the expected result, and which project docs to read if the task needs more context. Name the commands the task needs. Be concrete about visuals: tokens, sizes, states, both themes, phone width.
3. **Run.** Always `cd` in the same command (your shell may return to the repo root after each call), and pipe the stream to the pane:
   ```bash
   mkdir -p ~/.claude/agy-runs
   cd ../<repo>-agy && agy -p "$(cat <brief file>)" --mode accept-edits --remote-control \
     --output-format stream-json --print-timeout 1500s \
     | tee ~/.claude/agy-runs/live.ndjson | grep '"event":"result"'
   ```
   The `result` line has `conversation_id`, `status`, `usage` and `denied_actions`.
4. **Review, never on agy's word.** Read `git diff` in the worktree. Check every claim in agy's report against the files: agy can report work it did not do. Run typecheck, lint and build, open the result in a real browser for UI work (screenshots in both themes and at phone width), run an accessibility check, and add edge cases agy did not test.
5. **Send fixes** to the same conversation so agy keeps its context: the run command with `--conversation <conversation_id>` and an exact review as the prompt (what is wrong, where, and what it should be). A one- or two-line nit is cheaper to fix yourself; say so in the commit.
6. **Land.** Commit on the agy branch under the user's identity and conventions, merge into the working branch, remove the worktree and branch when the work is merged. Ship to production only with the user's approval.

## Gotchas

- **One refused command ends the whole run** and prints `jetski: no output produced — a tool required the "command" permission…`. Find the command in the `"state":"ERROR"` step of `live.ndjson`, then fix the brief or ask the user to allow it.
- agy refuses commands with **square brackets**, such as `git diff app/[id]/page.tsx`. Tell it to run `git diff` with no path.
- agy sometimes reads files with `sed` or `cat` piped through tools that are not allowed. The rules template forbids reading through the shell; keep that line.
- A run with **0 thinking tokens** in `usage` did shallow work and may misreport it. For design or multi-file work, name a stronger model with `--model` (list them with `agy models`).
- **Cost**: a five-fix batch can take hundreds of thousands of agy tokens, mostly reading and thinking. They count against the user's agy quota, not yours. Check what is left with `agy -p "/usage"`. Exact briefs and no refused commands keep it down.
- `--mode auto` may not be available on the user's account; the allow list is then the only way agy runs commands.

## Reporting to the user

After each batch: what agy changed, what you fixed or sent back and why, what you verified (and how), what is left, and the agy quota used if they care about it. Keep the briefs: save them in the project's docs if the user wants a record.
