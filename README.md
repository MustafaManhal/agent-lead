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
| `agent-run` | One command per run for agy, Claude Code, Codex, Gemini CLI, Qwen Code, OpenCode and Cursor Agent: adds the worker rules, applies safe per-run limits, records the run for the pane, and prints the session id for follow-ups. |
| `run-agent.sh` | Runs any other CLI and records its output for the pane, with start and end lines so every run shows its status and exit code. |
| `setup.sh` | The one-time, per-machine setup. |
| Templates | `AGENTS.md` (optional project rules for the worker), `allow-lists.md` (allow lists for running CLIs by hand) and `brief.md`. In `skills/agent-lead/templates/`. |

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

## Set up (once per machine)

1. Install and sign in to the worker CLI(s) you want to use.
2. Run the setup script once, yourself (Claude asks you to when it is missing):
   ```
   bash ~/.claude/plugins/cache/agent-lead/agent-lead/*/skills/agent-lead/setup.sh
   ```
   It installs `agent-run` and `run-agent.sh` in `~/.claude/agent-runs/`, lets Claude Code run them in every project, and adds a safe allow list to agy and Cursor Agent if you have them. It backs up every file it changes and is safe to run again.
3. Restart Claude Code (or `/reload-plugins`).

That's all: no per-project or per-session config. `agent-run` puts the worker rules in front of every brief and gives each CLI per-run limits (allowed tools, sandbox, or a temporary permissions file). A project rules file such as `AGENTS.md` is optional; the worker follows it when present.

Then ask Claude something like: "Have codex build X. You plan and review, I'll watch." and open `/agent`.

## Good to know

- The worker's tokens count against the worker's own account, not Claude's.
- Claude checks the worker's claims against the actual diff: workers can report work they did not do, especially on low-effort runs. For design or multi-file work, ask Claude to pick a stronger model.
- The pane reads `~/.claude/agent-runs/live.log`; `agent-run` and `run-agent.sh` write it. A run started some other way does not show.

## For agents

[`AGENTS.md`](AGENTS.md) explains the whole system for a coding agent: the data flow of a run, every event format the pane reads and how to add a new CLI, how the pane draws, allow lists, quotas, the review checklist and the known gotchas.

## License

MIT
