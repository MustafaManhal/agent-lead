# agent-lead

Make Claude Code or Codex the **lead** of your project and another coding agent the **worker**. Works in any
project. Both have plugin packages; Gemini CLI, OpenCode and Cursor can use the shared skill too
([install for other agents](#codex-gemini-cli-opencode-cursor-and-other-agents)).

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
| Setup | None | None (the plugin sets itself up) |

## Start

In any project, run:

```
/lead
```

or `/lead build the settings screen` (words after `/lead` are your goal for the session). `/lead` is the only
command. The first time in a project it asks which workflow style you want: Handoff or Pane (say "switch to pane" later to
change it). The first time, the lead then:

1. Looks around the project (git, stack, commands, existing docs and checklists).
2. Asks you a few questions at once: the worker, what to do about missing docs, where the worker works.
3. For a new project (or one without docs), runs the **foundation**: intake questions, research on competitors,
   references and technology (with Playwright screenshots), decisions, then the **six docs**. You approve them.
4. Writes `.agent-lead/`: `LEAD.md` (this project's playbook and current state), `WORKER.md` (the worker's rules),
   `status.md`, and a git-ignored `briefs/` folder. Adds short pointers to `AGENTS.md` and `CLAUDE.md`.
5. Starts milestone M0 (the foundation: tooling, design tokens, checks, a screenshot helper), then works the plan
   item by item.

Every later session: run `/lead` again; the lead reads
`LEAD.md` and continues where the last one stopped.

## The loop for each item

1. The lead picks the next open item in the implementation plan, in order, and finishes it before another: it stays in the
   current phase (milestone) until every task of that phase is complete, then starts the next phase the same way.
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
| `/lead` command | The only command (installed by `install-lead.sh`). Asks which workflow (Handoff or Pane), then starts or resumes the lead workflow in the current project. |
| `agent-lead` skill | Started by `/lead` (hidden from the slash menu). `SKILL.md` (the procedure) plus `project-setup.md`, `foundation.md`, `research.md`, `playwright.md`, `review.md`, `workflows/handoff.md`, `workflows/pane.md` and `clis.md`. |
| Templates | The six docs, `LEAD.md`, `WORKER.md`, `brief.md`, `review-round.md`, `status.md`, `decisions.md`, an `AGENTS.md` pointer section, allow lists. |
| Checklist page | Every project gets one (you are asked once): the plan as a page with overall progress, the next item, milestone cards that fold away when done, Details for long notes, Expand all / Collapse all / Hide done, light and dark, phone-friendly. Published privately with the Artifact tool to one link that stays the same, or kept as a local file. Rebuilt after every checklist change. Built by `plan-page.mjs`. |
| `/agent` pane | Live view of a Pane-mode run: each file read or written, each command with its exit code, refused commands in red, the reply, time and tokens. Opens by itself; `/agent close` hides it. `/agy` still works. |
| Tools (`skills/agent-lead/tools/`) | Small commands that work in any project, configured by one optional `.agent-lead/config.json` (detected when missing): `next` (the next item with the files to read), `check` (typecheck, lint, tests in one line), `done` and `ship` (mark the plan, rebuild the page, commit with the worker's credit), `land` (merge with compact conflicts); `outline`, `show`, `rep`, `snippet` (read and edit code cheaply); `play` (real input through Playwright), `observe` (a reference product in a browser that stays signed in), `audit-ui` (overflow, tap targets and contrast at nine widths); `research.py`, `ask` (offload to a cheaper model), `lock` (shared resources between parallel workers); macOS helpers for windows, input and the clipboard. See `skills/agent-lead/tools.md`. |
| `agent-run`, `run-agent.sh` | Launch a worker CLI headless with per-run limits and record it for the pane. |
| `hooks/first-run.sh` | Sets the plugin up on the first session after install or update: `/lead` (`install-lead.sh`) and the Pane-mode scripts (`setup.sh`). |


## Install

At the prompt of a Claude Code terminal session:

```
/plugin install agent-lead --marketplace MustafaManhal/agent-lead
```

Answer `y` to add the marketplace, then pick a scope (user scope is best). That is the only step.

The next time Claude Code starts, the plugin sets itself up (a SessionStart hook, `hooks/first-run.sh`, once per
plugin version):
- installs the plain `/lead` command in `~/.claude/commands/lead.md` (Claude Code shows plugin commands with the
  plugin's prefix, so the plugin puts `/lead` in your own commands folder);
- installs the Pane-mode scripts (`agent-run`, `run-agent.sh`, worker rules) in `~/.claude/agent-runs/`, lets Claude
  Code run them, and adds a safe allow list to agy and Cursor Agent if you have them (backups first).

Restart Claude Code after installing (or run `/reload-plugins` twice: once to load the hook, once to see `/lead`).
Then run `/lead` in any project. The log is `~/.claude/agent-runs/setup.log`. To uninstall, remove the plugin and
delete `~/.claude/commands/lead.md`.
From a shell: `claude plugin install agent-lead --marketplace MustafaManhal/agent-lead`. In the desktop app: + next
to the prompt box, Plugins, Add marketplace `MustafaManhal/agent-lead`, then Add plugin.

Already installed? Update it (`/plugin marketplace update agent-lead`) and restart Claude Code; the setup runs again
for the new version.

### Codex plugin

With Codex CLI's plugin commands:

```bash
codex plugin marketplace add MustafaManhal/agent-lead
codex plugin add agent-lead@agent-lead
```

In the desktop app, start a new chat, type `/lead`, select **Lead** in the slash menu, and add your goal.
Enabled skills appear in the app's slash menu. The setup below installs a short `lead` alias so you can use
the bare name. Type `/agent` to select the worker-status skill the same way.

In CLI/IDE sessions, use `$lead` or the skills picker.
The plugin's qualified skill names are `$agent-lead:lead`, `$agent-lead:agent` (worker status), and
`$agent-lead:agent-lead` (the full workflow). Standalone aliases below use `$lead`, `$agent`, and `$agent-lead`.

The repo includes `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json`; the latter also works as
a local repo marketplace. To test a clone, use `codex plugin marketplace add /absolute/path/to/agent-lead`, then
the same `plugin add` command. Plugin support and installation UI vary by Codex surface.

The trusted SessionStart hook installs the short aliases in `~/.agents/skills/` and worker tools into
`~/.codex/agent-runs/` (or `$CODEX_HOME/agent-runs/`).
Hooks require the user's normal trust review and may not run on every surface. The bundled skills work without
the hook; install the runtime manually when needed:

```bash
node /absolute/path/to/agent-lead/skills/agent-lead/install-codex.mjs --skills
```

Setup copies the launcher, wrapper, worker rules, status viewer and the same event parser used by Claude's pane.
It preserves the first changed copy as `.bak-agent-lead`, is safe to repeat, and does not modify Codex approval
policy, Claude settings, or worker allow lists. Use the worker CLI's normal permission setup for agy or Cursor.
The viewer requires Node.js 22.18 or newer; worker CLIs must already be installed and signed in.

The workflow includes both Handoff and launched workers (recorded as Pane in the shared playbook). A launched
worker keeps the same sandbox/allow-list limits, brief/report contract and `--resume` review rounds:

```bash
~/.codex/agent-runs/agent-run codex /absolute/brief.md --cd /absolute/worker-checkout
node ~/.codex/agent-runs/agent-view.mjs --json
node ~/.codex/agent-runs/agent-view.mjs --watch
```

The terminal viewer shows tool steps, failures, denied calls, session ID, final reply, elapsed time, tokens and
exit code. Ctrl-C closes the viewer without stopping the worker. `$agent` gives a snapshot in the conversation.
`AGENT_LEAD_LOG` (or the viewer's `--log`) chooses a different log. Codex runs use their own log by default so
they do not overwrite Claude's pane. Codex does not provide Claude's custom side-pane UI; the terminal viewer
is its live view. The six docs, checklist page, project files, tools and review/ship procedure are shared.

For the supported Codex packaging, skill invocation and hook trust rules, see
[OpenAI's plugin documentation](https://developers.openai.com/plugins/build/plugins) and
[skills documentation](https://learn.chatgpt.com/docs/build-skills). The
[desktop slash-command reference](https://learn.chatgpt.com/docs/reference/slash-commands) documents skills in the slash menu.

### Codex, Gemini CLI, OpenCode, Cursor and other agents

The shared skill uses the open Agent Skills format. For a standalone Codex installation without a plugin
marketplace, clone the repo and install the runtime and all three skills:

```bash
git clone https://github.com/MustafaManhal/agent-lead.git ~/.agent-lead
node ~/.agent-lead/skills/agent-lead/install-codex.mjs --skills
```

Update with `git -C ~/.agent-lead pull`, rerun the installer, and start a new session. For the other agents,
install just the shared skill in `~/.agents/skills/`:

```bash
git clone https://github.com/MustafaManhal/agent-lead.git ~/.agent-lead
mkdir -p ~/.agents/skills
ln -s ~/.agent-lead/skills/agent-lead ~/.agents/skills/agent-lead
```

Update later with `git -C ~/.agent-lead pull`. Then restart the agent and start it in your project:

| Agent | Where it finds the skill | Start the lead |
| --- | --- | --- |
| Codex / desktop app | Plugin above, or standalone `~/.agents/skills/` | Desktop: type `/lead` and select Lead; CLI/IDE: `$lead` |
| Gemini CLI | `~/.agents/skills/` or `~/.gemini/skills/`; `.agents/skills/` or `.gemini/skills/` in the repo | Ask "use the agent-lead skill and lead this project"; `/skills list` shows it, `/skills reload` picks up a new folder |
| OpenCode | `~/.agents/skills/`, `~/.config/opencode/skills/` or `~/.claude/skills/`; the same under `.agents/`, `.opencode/` or `.claude/` in the repo | Ask "use the agent-lead skill and lead this project" |
| Cursor | `~/.agents/skills/` or `~/.cursor/skills/`; `.agents/skills/` or `.cursor/skills/` in the repo | `/agent-lead` in Agent chat |
| Any other agent | Point it at the files: "read `~/.agent-lead/skills/agent-lead/SKILL.md` and lead this project" | |

To share the skill with a team through the repo instead, copy (or add as a git submodule)
`skills/agent-lead` into the project's `.agents/skills/agent-lead`.

What changes when the lead is not Claude Code:
- Use the host's skill invocation: `/lead` and `/agent` in the desktop app's skill menu, or `$lead` and `$agent` in the CLI/IDE.
- Codex has a terminal viewer for launched workers. Other hosts can use Handoff or start a worker from their shell.
- The checklist page is kept as a local file, `.agent-lead/checklist.html` (publishing it as a private link uses
  Claude's Artifact tool). Open it in a browser.
- Use the host's question tool when available, otherwise plain chat.
- The tools work the same: `node ~/.agents/skills/agent-lead/tools/check.mjs` and the rest (`tools.md`).

Workers need nothing installed: any coding agent CLI can be the worker in either workflow.

## Pane mode

Install and sign in to the worker CLI(s) you want to use. The plugin's first-run setup already installed
`agent-run` and its allow rules. If it did not (no Node.js, for example; see `~/.claude/agent-runs/setup.log`),
run it by hand: `bash ~/.claude/plugins/marketplaces/agent-lead/skills/agent-lead/setup.sh`, then restart.

Handoff mode needs no setup.

## Full and Light tracks

- **Full**: the six docs, for a new product or anything with accounts, payments or stored user data.
- **Light**: one plan file (`.agent-lead/plan.md`) for a feature, a bug batch or a prototype of up to about 15 items.

Every plan item ends with `{easy}` or `{hard}`. The tag picks the worker model and how deep the review goes.

## When the worker runs out

LEAD.md holds a **worker chain** (main worker, backup, last resort). When a worker stops on quota or crashes, the
lead runs the same brief with the next one and tells you in one line; it asks only when the chain is used up.
Pane runs print `USAGE <cli> <model> tokens=… seconds=…`, and each landed item's cost goes into `status.md`.

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
