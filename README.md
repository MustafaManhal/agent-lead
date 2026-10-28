# agent-lead

Make Claude Code the **lead** of your project and another coding agent the **worker**. Works in any project. Codex,
Gemini CLI, OpenCode and Cursor can be the lead too ([install for other agents](#codex-gemini-cli-opencode-cursor-and-other-agents)).

- **The lead (Claude Code)** asks the right questions, does the research, writes the six product docs (PRD, TRD,
  UI/UX design, app flow, backend schema, implementation plan), keeps the checklist, writes a brief per item,
  reviews every change against the diff, sends review rounds, commits and reports to you.
- **The worker** (agy, Codex, Gemini CLI, Qwen Code, OpenCode, Cursor Agent, a second Claude Code, Aider, or any
  other agent) does about 95% of each item: research, code, tests, checks in the running app, and a written report.
  It never commits.
- **You** pick the workflow and the worker, approve the docs and the plan, and decide what ships.

## Two workflows

| | Handoff | Pane |
| --- | --- | --- |
| Who starts the worker | You, in your own tool (emdash, another terminal, an IDE, another Claude Code) | The lead, headless, with `agent-run` |
| How the brief gets there | The lead gives you a one-line prompt to paste | The lead launches it |
| Watching | In your tool, side by side with other agents | The `/agent` pane beside the chat: files, commands, refusals, reply, tokens |
| When it's done | You tell the lead "report ready" | The run ends; the lead reviews right away |
| Worker can | Use the project's real tools (dev server, browser, screenshots) | Run only allow-listed commands (widen per run) |
| Setup | None | `setup.sh` once per machine |

## Start

In any project, run:

```
/lead
```

or `/lead handoff`, `/lead pane`, `/lead handoff build the settings screen`. The first time, the lead:

1. Looks around the project (git, stack, commands, existing docs and checklists).
2. Asks you a few questions at once: the workflow, the worker, what to do about missing docs, where the worker works.
3. For a new project (or one without docs), runs the **foundation**: intake questions, research on competitors,
   references and technology (with Playwright screenshots), decisions, then the **six docs**. You approve them.
4. Writes `.agent-lead/`: `LEAD.md` (this project's playbook and current state), `WORKER.md` (the worker's rules),
   `status.md`, and a git-ignored `briefs/` folder. Adds short pointers to `AGENTS.md` and `CLAUDE.md`.
5. Starts milestone M0 (the foundation: tooling, design tokens, checks, a screenshot helper), then works the plan
   item by item.

Every later session: run `/lead` again. The lead reads `LEAD.md` and continues where the last one stopped.

## The loop for each item

1. The lead picks the next open item in the implementation plan, in order.
2. It writes a self-contained brief: goal, research to do first, what to build, how to check it, the report path.
3. Handoff: you paste the prompt it gives you into the worker. Pane: it launches the worker and `/agent` opens.
4. The worker researches, builds, tests, checks in the app, and writes `<brief>.report.md`.
5. The lead reviews: the report against the brief, the diff against the report, the checks, the risky code, the
   screenshots, and one real check of its own. Then either a review round (`<brief>-2.md`) or a commit.
6. On commit: the checklist item is marked, the worker's branch is merged, the worker's checkout is synced,
   `status.md` and `LEAD.md` are updated, the checklist page is rebuilt and republished, and you get the totals, the
   page link and the next prompt.

## What's inside

| Part | What it does |
| --- | --- |
| `/lead` command | Starts or resumes the lead workflow in the current project. |
| `agent-lead` skill | `SKILL.md` (the procedure) plus `project-setup.md`, `foundation.md`, `research.md`, `playwright.md`, `review.md`, `workflows/handoff.md`, `workflows/pane.md` and `clis.md`. |
| Templates | The six docs, `LEAD.md`, `WORKER.md`, `brief.md`, `review-round.md`, `status.md`, `decisions.md`, an `AGENTS.md` pointer section, allow lists. |
| Checklist page | Every project gets one (you are asked once): the plan as a page with overall progress, the next item, milestone cards that fold away when done, Details for long notes, Expand all / Collapse all / Hide done, light and dark, phone-friendly. Published privately with the Artifact tool to one link that stays the same, or kept as a local file. Rebuilt after every checklist change. Built by `plan-page.mjs`. |
| `/agent` pane | Live view of a Pane-mode run: each file read or written, each command with its exit code, refused commands in red, the reply, time and tokens. Opens by itself; `/agent close` hides it. `/agy` still works. |
| Tools (`skills/agent-lead/tools/`) | Small commands that work in any project, configured by one optional `.agent-lead/config.json` (detected when missing): `next` (the next item with the files to read), `check` (typecheck, lint, tests in one line), `done` and `ship` (mark the plan, rebuild the page, commit with the worker's credit), `land` (merge with compact conflicts); `outline`, `show`, `rep`, `snippet` (read and edit code cheaply); `play` (real input through Playwright), `observe` (a reference product in a browser that stays signed in), `audit-ui` (overflow, tap targets and contrast at nine widths); `research.py`, `ask` (offload to a cheaper model), `lock` (shared resources between parallel workers); macOS helpers for windows, input and the clipboard. See `skills/agent-lead/tools.md`. |
| `agent-run`, `run-agent.sh` | Launch a worker CLI headless with per-run limits and record it for the pane. |
| `setup.sh` | One-time setup for Pane mode. |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install agent-lead --marketplace MustafaManhal/agent-lead
```

Answer `y` to add the marketplace, then pick a scope (user scope makes `/lead` available in every project).
From a shell: `claude plugin install agent-lead --marketplace MustafaManhal/agent-lead`. In the desktop app: + next
to the prompt box, Plugins, Add marketplace `MustafaManhal/agent-lead`, then Add plugin.

Already installed? Update it (`/plugin update agent-lead`, or reinstall), then run `/reload-plugins`.

### Codex, Gemini CLI, OpenCode, Cursor and other agents

The skill is a standard `SKILL.md` folder (the open Agent Skills format), so other agents can be the lead too.
Codex, Gemini CLI, OpenCode and Cursor all read skills from `~/.agents/skills/`. Install it once there:

```bash
git clone https://github.com/MustafaManhal/agent-lead.git ~/.agent-lead
mkdir -p ~/.agents/skills
ln -s ~/.agent-lead/skills/agent-lead ~/.agents/skills/agent-lead
```

Update later with `git -C ~/.agent-lead pull`. Then restart the agent and start it in your project:

| Agent | Where it finds the skill | Start the lead |
| --- | --- | --- |
| Codex (CLI, IDE extension) | `~/.agents/skills/` (all projects) or `.agents/skills/` in the repo | `$agent-lead`, or pick it from `/skills` |
| Gemini CLI | `~/.agents/skills/` or `~/.gemini/skills/`; `.agents/skills/` or `.gemini/skills/` in the repo | Ask "use the agent-lead skill and lead this project"; `/skills list` shows it, `/skills reload` picks up a new folder |
| OpenCode | `~/.agents/skills/`, `~/.config/opencode/skills/` or `~/.claude/skills/`; the same under `.agents/`, `.opencode/` or `.claude/` in the repo | Ask "use the agent-lead skill and lead this project" |
| Cursor | `~/.agents/skills/` or `~/.cursor/skills/`; `.agents/skills/` or `.cursor/skills/` in the repo | `/agent-lead` in Agent chat |
| Any other agent | Point it at the files: "read `~/.agent-lead/skills/agent-lead/SKILL.md` and lead this project" | |

To share the skill with a team through the repo instead, copy (or add as a git submodule)
`skills/agent-lead` into the project's `.agents/skills/agent-lead`.

What changes when the lead is not Claude Code:
- No `/lead` command: ask for the skill by name, as above.
- No `/agent` pane, so use the Handoff workflow (you paste each brief into the worker), or let the lead start
  the worker CLI from its own shell.
- The checklist page is kept as a local file, `.agent-lead/checklist.html` (publishing it as a private link uses
  Claude's Artifact tool). Open it in a browser.
- Questions come as plain chat messages instead of option pickers.
- The tools work the same: `node ~/.agents/skills/agent-lead/tools/check.mjs` and the rest (`tools.md`).

Workers need nothing installed: any coding agent CLI can be the worker in either workflow.

## Pane mode setup (once per machine)

1. Install and sign in to the worker CLI(s) you want to use.
2. Run the setup script yourself (the lead asks you to when it is missing):
   ```
   bash ~/.claude/plugins/cache/agent-lead/agent-lead/*/skills/agent-lead/setup.sh
   ```
   It installs `agent-run` and `run-agent.sh` in `~/.claude/agent-runs/`, lets Claude Code run them in every
   project, and adds a safe allow list to agy and Cursor Agent if you have them. It backs up every file it changes.
3. Restart Claude Code (or `/reload-plugins`).

Handoff mode needs no setup.

## Good to know

- The worker's tokens count against the worker's own account. Per-request plans (for example GitHub Copilot
  models in OpenCode) suit long runs.
- The lead checks the worker's claims against the actual diff: workers sometimes report work they did not do.
- The lead never pushes, deploys or publishes unless you ask.
- Free models may keep or train on your code; the lead tells you before suggesting one for a private project.

## For agents

[`AGENTS.md`](AGENTS.md) explains the system for a coding agent: the files, the data flow of a Pane run, every
event format the pane reads and how to add a new CLI, how the pane draws, allow lists, quotas and gotchas.

## License

MIT
