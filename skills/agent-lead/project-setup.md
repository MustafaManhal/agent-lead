# First `/lead` in a project: set it up

Goal: in one short exchange, know the project, agree the workflow with the user, make sure the six product docs
exist (their last one, the implementation plan, is the checklist), and leave a `.agent-lead/LEAD.md` that lets any
later session continue without this conversation.

## 1. Discover (read only, quick)

Run these yourself; do not ask the user what you can find out.

- **Git**: `git rev-parse --show-toplevel`, current branch, default branch (`git symbolic-ref refs/remotes/origin/HEAD`),
  `git status --short`, `git worktree list`, the last 15 subjects (`git log --oneline -15`) for the commit style.
  Not a git repo: tell the user the workflow needs git (worktrees, review by diff) and offer `git init`.
- **Stack and commands**: `package.json` scripts, `Makefile`, `pyproject.toml` / `tox.ini`, `Cargo.toml`, `go.mod`,
  `Gemfile`, `build.gradle`, CI files (`.github/workflows/*.yml`). Note the commands for: install, dev server, test,
  lint, typecheck, build, and a single fast "check" if one exists.
- **Agent docs**: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/`, `.agents/rules/`, `CONTRIBUTING.md`,
  `docs/`, `README.md`. These hold rules both you and the worker must follow.
- **Product docs**: a PRD, TRD, design doc, flows, schema or implementation plan under any name (`docs/`, `.ai/docs/`,
  `spec*`, `*requirements*`, `*design*`). Note which of the six exist and which are missing.
- **An existing checklist**: tracked files whose names match `plan|roadmap|todo|checklist|tasks|backlog|milestones`
  (`git ls-files | grep -iE '...'`), markdown files with many `- [ ]` / `- [x]` lines, `docs/` plans. If `gh` is
  installed and the repo has a GitHub remote, open issues and milestones (read only) are a candidate too.
- **Secrets**: note `.env*` and similar files so you never copy them into a brief or a worktree.

## 2. Ask the user (one AskUserQuestion with up to four questions; plain chat when the tool is missing)

Skip any question the `/lead` arguments or the project already answer.

1. **Workflow** — options:
   - "Handoff (you paste prompts into the worker)" — the user runs the worker in their own tool (emdash, another
     terminal, an IDE, a second Claude Code). Recommend it when the user wants to watch several agents side by side
     or uses a tool `agent-run` does not launch.
   - "Pane (I launch the worker, you watch /agent)" — you start the worker CLI headless with `agent-run`; the
     `/agent` pane shows every step live. Needs the one-time `setup.sh` (`workflows/pane.md`).
2. **Worker** — which agent and, if they care, which model. Pane needs a CLI `agent-run` knows (`clis.md`) or any CLI
   through `run-agent.sh`. Handoff works with anything.
3. **Docs and checklist** — "Found <files>: build the missing docs from them" (recommended when some exist) / "New
   project: start the foundation (questions, research, the six docs)" / "Use GitHub issues as the checklist and write
   the docs around them".
4. **Where the worker works** — "A worktree I create next to this repo" (recommended) / "A path you give me" (for
   example one emdash made) / "This checkout" (only for tiny projects; you lose the clean review diff).

## 3. The six docs and the checklist

- **None or some missing**: follow `foundation.md` now. For an existing codebase, write the docs from what the code
  does plus the user's answers, mark what is already built as `[x]` in the implementation plan, and put the remaining
  work after it. Never skip this to "save time": briefs, reviews and the checklist all point into these docs.
- **An existing checklist in another file**: keep it if the user prefers it, and record its path in LEAD.md as "the
  checklist"; the implementation plan then links to it instead of copying it. Learn its markers (`[x]` done, `[~]`
  partial, `[ ]` open is the convention; adopt the file's own if it differs) and its order.
- **GitHub issues**: mirror them into the implementation plan (one line per issue with its number) so order and
  status live in one file; never close or edit issues unless the user asks.
- Whatever the source, the user approves the plan before work starts. Their priorities decide the order.

## 4. Write `.agent-lead/`

```
.agent-lead/
  LEAD.md        the playbook for this project (templates/LEAD.md, filled in)       commit
  status.md      one dated line per step (templates/status.md)                      commit
  WORKER.md      the worker's rules for this project (templates/WORKER.md, filled)  commit
  briefs/        briefs, review rounds and worker reports                           git-ignored
  checklist.html the progress page, when you make one                               git-ignored
```

- Fill LEAD.md completely: workflow, worker and model, every absolute path (lead checkout, worker checkout, briefs
  folder, checklist), the commands from step 1, the commit style, the review checks that matter for this project
  (UI screenshots, API contract tests, migrations, accessibility…), the checklist page URL if any, and the current
  state. A new session must be able to continue from it alone.
- Git-ignore `briefs/` and `checklist.html` locally: add `.agent-lead/briefs/` and `.agent-lead/checklist.html` to
  `.git/info/exclude` (shared by every worktree), not to `.gitignore`, unless the user wants it in the repo.
- Point the agents at the files:
  - Lead sessions: add to the project's `CLAUDE.md` (create it if missing) a short section: "Lead sessions: run
    `/lead` (agent-lead plugin) or read `.agent-lead/LEAD.md` first."
  - Workers: add the section in `templates/AGENTS.md` to `AGENTS.md` (create it if missing; most worker CLIs load
    it). Gemini CLI loads `GEMINI.md`, Qwen Code `QWEN.md`: add the same lines there if the user uses them. If the
    worker is a second Claude Code, the `CLAUDE.md` section must also say: "if your prompt gives you a brief in
    `.agent-lead/briefs/`, you are the worker, not the lead".
  - Tell the user which files you created or changed.
- The six docs live in the project's docs folder (`foundation.md`), not in `.agent-lead/`: they are the product's
  docs, for people too.
- Commit LEAD.md, status.md, WORKER.md and the pointer edits in one commit ("agent-lead: project playbook
  and checklist"), unless the user prefers to keep them uncommitted.

## 5. The worker's checkout

- **You create it**: `git worktree add ../<repo>-worker -b agent-lead/worker <lead branch>`. Install dependencies
  there yourself and generate anything the type checker needs (workers do not install). Never copy secrets in.
- **The user gives a path**: check it is a worktree of this repo (`git -C <path> rev-parse --git-common-dir`), on its
  own branch, clean. If its branch is behind the lead branch, ask before fast-forwarding it.
- Record the path and branch in LEAD.md.

## 6. Finish

Tell the user, briefly: the workflow, the worker, where the six docs and the checklist are (and the page link if you
made one), what you created, the first item. Then start the loop (SKILL.md section 2) with that item, usually M0:
write its brief and either launch it (Pane) or give the paste-ready prompt (Handoff).
