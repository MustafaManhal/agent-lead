# Pane workflow: you launch the worker, the user watches /agent

You start the worker CLI headless with `agent-run`. Every step it takes (files read and written, commands and exit
codes, refused commands in red, its reply, time and tokens) shows live in the `/agent` pane beside the chat.

## One-time setup (per machine, by the user)

Check: `test -x ~/.claude/agent-runs/agent-run && echo ready`. If it is not ready, ask the user to run this once
themselves (it edits their settings, so it must be them), then restart Claude Code or run `/reload-plugins`:

```
! bash <this skill's folder>/setup.sh
```

It installs `agent-run`, `run-agent.sh` and the worker rules into `~/.claude/agent-runs/`, lets Claude Code run them
in every project, and adds a safe allow list to the worker CLIs that keep theirs in a file (agy, Cursor Agent).
`agent-run` gives the others per-run limits (Claude Code and Gemini/Qwen: an allowed-tools list; Codex: the
`workspace-write` sandbox; OpenCode: a temporary `opencode.json` removed after the run).

The worker CLI must be installed and signed in. If it is not, tell the user. Do not install it or sign in for them.

## Run an item

```bash
~/.claude/agent-runs/agent-run <cli> <lead checkout>/.agent-lead/briefs/<NN>-<item>.md --cd <worker checkout> [--model <model>]
```

- `<cli>`: `agy`, `claude`, `codex`, `gemini`, `qwen`, `opencode` (needs `--model provider/model`) or `cursor`. Any
  other CLI: `cd <worker checkout> && ~/.claude/agent-runs/run-agent.sh <name> <its headless command>` in one command
  (see `clis.md`).
- One command, no `cd` chain before it: your shell may return to the repo root between commands.
- `agent-run` puts `worker-rules.md` in front of the brief, applies the per-run limits, records the run for the pane,
  prints the run's last lines and `SESSION <cli> <id>`. Keep that id in the brief's report header and in status.md.
- Extra commands for one run: `AGENT_LEAD_ALLOW="npm run e2e,make check" agent-run …`. Only commands the task needs;
  never `rm`, `git commit/push/merge/checkout`, package installs, `curl`, or "approve everything" switches.
- The brief asks for the report file like in Handoff mode; headless workers write it with their file tools. If the
  run ends without it, the run's final reply is the report: save it to `<brief>.report.md` yourself.

## Review rounds

Send fixes to the same session so it keeps its context:

```bash
~/.claude/agent-runs/agent-run <cli> <lead checkout>/.agent-lead/briefs/<NN>-<item>-2.md --cd <worker checkout> --resume <session id>
```

## What a headless worker cannot do

It runs only allow-listed commands (`worker-rules.md`): no dev server, no browser, no screenshots, unless you widen
the list for the run. So in Pane mode you do the in-app check yourself during review (screenshots, real input), or
add the exact commands the task needs to `AGENT_LEAD_ALLOW`. Say in LEAD.md which of the two this project uses.

## Gotchas

- One refused command can end a run (agy). The pane marks it `DENIED` in red. Fix the brief or widen the list.
- Some workers refuse commands with square brackets (`git diff app/[id]/page.tsx`): tell them to run `git diff` with
  no path.
- Workers sometimes read files through the shell (`sed`, `python`): the rules forbid it; keep that line.
- The pane reads `~/.claude/agent-runs/live.log`, overwritten by each run, so it shows one run at a time. A run
  started any other way does not show.
- Features that need server keys behave differently in a worktree without `.env` files. Check them in the lead
  checkout after merging.
