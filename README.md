# agent-lead

Use any coding agent CLI as your coder and Claude Code as its lead, and watch the whole thing live.

- **The worker**, any CLI you like (agy, Codex, Gemini CLI, Qwen Code, OpenCode, Cursor Agent, a second Claude Code, Aider, and others), writes the code and runs only the commands you allow.
- **Claude Code** plans the work, writes the brief, reviews every change itself (diff, typecheck, build, browser), sends fixes back to the same worker session, and lands the result.
- **You** watch every step in a pane beside the chat (`/agent`) and decide what ships.

## What's inside

| Part | What it does |
| --- | --- |
| `agent-lead` skill | The workflow Claude follows: setup checks, a git worktree per task, short briefs, a command table for each CLI, a review checklist, the fix loop, and the known pitfalls. |
| `/agent` pane | A live panel beside the chat: the agent's name, each file it reads or writes, each command with its exit code, refused commands in red, its reply, and time, tokens and exit code at the end. It reads the live streams of agy, Claude Code, Codex, Gemini CLI, Qwen Code, OpenCode and Cursor Agent, and shows any other CLI's plain output line by line. It opens by itself when a run starts. `/agy` still works. |
| `run-agent.sh` | Runs any CLI and records its output for the pane, with start and end lines so every run shows its status and exit code. |
| Templates | `AGENTS.md` (rules the worker loads in your repo), `allow-lists.md` (a safe allow list for each CLI) and `brief.md`. In `skills/agent-lead/templates/`. |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install agent-lead --marketplace MustafaManhal/agent-lead
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it available in every project).

From a shell:

```
claude plugin install agent-lead --marketplace MustafaManhal/agent-lead
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `MustafaManhal/agent-lead`, then Add plugin.

Installed the earlier `agy-lead`? Uninstall it (`/plugin uninstall agy-lead`) and install `agent-lead`; it does everything `agy-lead` did.

## Set up (once)

1. Install and sign in to the worker CLI you want to use.
2. Copy the wrapper: `mkdir -p ~/.claude/agent-runs && cp <plugin>/skills/agent-lead/run-agent.sh ~/.claude/agent-runs/ && chmod +x ~/.claude/agent-runs/run-agent.sh` (Claude does this for you when you ask it to set up).
3. Let Claude run it: add `"Bash(/Users/<you>/.claude/agent-runs/run-agent.sh:*)"` to `permissions.allow` in your project's `.claude/settings.local.json`.
4. Tell the worker what it may run without asking: follow your CLI's section in `skills/agent-lead/templates/allow-lists.md`. Keep destructive commands (`rm`, `git push`, installs, `curl`) off the list, and never use "approve everything" switches.
5. Give the worker your project's rules: copy `skills/agent-lead/templates/AGENTS.md` to where your CLI loads it (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, …), fill in the project section, and commit it.

Then ask Claude something like: "Have codex build X. You plan and review, I'll watch."

## Good to know

- The worker's tokens count against the worker's own account, not Claude's.
- Claude checks the worker's claims against the actual diff: workers can report work they did not do, especially on low-effort runs. For design or multi-file work, ask Claude to pick a stronger model.
- The pane reads `~/.claude/agent-runs/live.log`; the wrapper writes it. A run started some other way does not show.

## For agents

[`AGENTS.md`](AGENTS.md) explains the whole system for a coding agent: the data flow of a run, every event format the pane reads and how to add a new CLI, how the pane draws, allow lists, quotas, the review checklist and the known gotchas.

## License

MIT
