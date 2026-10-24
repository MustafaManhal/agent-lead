# agy-lead

Use the Antigravity CLI (`agy`) as your coder and Claude Code as its lead, and watch the whole thing live.

- **agy** writes the code and runs only the commands you allow.
- **Claude Code** plans the work, writes agy's brief, reviews every change itself (diff, typecheck, build, browser), sends fixes back to the same agy conversation, and lands the result.
- **You** watch agy's every step in a pane beside the chat (`/agy`) and in agy's own browser view, and you decide what ships.

## What's inside

| Part | What it does |
| --- | --- |
| `agy-lead` skill | The workflow Claude follows: one-time setup checks, a git worktree per task, short briefs, the run command, a review checklist, the fix loop, and the known pitfalls. |
| `/agy` pane | A live panel beside the chat: each file agy reads or writes, each command with its exit code, refused commands in red, agy's reply, and time and tokens when it ends. It opens by itself when a run starts. |
| Templates | `AGENTS.md` (rules agy loads in your repo on every run), `agy-settings.json` (a safe starting allow list) and `brief.md` (the shape of a good brief). They live in `skills/agy-lead/templates/`. |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install agy-lead --marketplace MustafaManhal/agy-lead
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it available in every project).

From a shell:

```
claude plugin install agy-lead --marketplace MustafaManhal/agy-lead
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `MustafaManhal/agy-lead`, then Add plugin.

## Set up (once)

1. Install the Antigravity CLI and sign in, so `agy --version` works.
2. Let Claude call agy: add `"Bash(agy -p:*)"` to `permissions.allow` in your project's `.claude/settings.local.json`.
3. Tell agy which commands it may run: merge `skills/agy-lead/templates/agy-settings.json` into `~/.gemini/antigravity-cli/settings.json`. Headless agy cannot ask you, so anything not listed is refused, and one refused command ends its run. Keep destructive commands (`rm`, `git push`, installs, `curl`) off the list.
4. Give agy your project's rules: copy `skills/agy-lead/templates/AGENTS.md` to `.agents/rules/AGENTS.md` in your repo, fill in the project section, and commit it.
5. Optional, to watch in the browser too: `agy remote-control start --session --name <machine-name>`, then open https://antigravity.google.com.

Then ask Claude something like: "Have agy build X. You plan and review, I'll watch."

## Good to know

- agy's tokens count against your Antigravity quota, not Claude's. Check what is left with `agy -p "/usage"`.
- Claude reviews agy's claims against the actual diff: agy can report work it did not do, especially on low-effort runs. For design or multi-file work, ask Claude to pick a stronger agy model (`agy models` lists them).
- The pane reads `~/.claude/agy-runs/live.ndjson`. The skill pipes every run there; a run started some other way does not show.

## License

MIT
