# Lead playbook for <project>

Read this whole file at the start of every lead session (`/lead` does it). It is everything a new session needs to
continue without the earlier conversations. The method is the agent-lead skill; this file holds this project's
facts. Keep section 8 current.

## 1. Workflow
- Lead host: <Claude Code | Codex | other>. Entry point: </lead | $lead | skill name>.
- Mode: <Handoff | Pane>. Changed on <date> because <reason>. Track: <Full (six docs) | Light (.agent-lead/plan.md)>.
- Worker chain (used in order when a worker stops on quota or crashes, without asking the user):
  1. <agent and model> 2. <backup agent or model> 3. <ask the user | the lead builds that one item>.
- Models by item size: `{easy}` → <cheaper model>; `{hard}` → <stronger model>.
- The worker does about 95% of each item (build, tests, in-app check, research, report). The lead plans, writes
  briefs, reviews, commits, keeps the checklist and reports to the user.
- Lead may fix small things in the worker's code: <no (default) | only one-line typos | yes>.
- Parallel lead work: <none | items the user handed to the lead: …>.

## 2. Paths
| What | Path |
| --- | --- |
| Lead checkout and branch | <abs path> (`<branch>`) |
| Worker checkout and branch | <abs path> (`<branch>`) |
| Briefs and reports | <abs path>/.agent-lead/briefs/ |
| Checklist (implementation plan) | <path>/06-implementation-plan.md |
| The six docs | <docs folder>/01-PRD.md … 06-implementation-plan.md |
| Research and decisions | <path>/research/, <path>/decisions.md |
| Status log | .agent-lead/status.md |
| Checklist page | <published URL (private until shared) \| local: .agent-lead/checklist.html \| declined <date>> |

## 3. Start of every session
1. Read `.agent-lead/handoff.md` first when it exists (generated after every ship: next item, last ships, open
   briefs, workers). Then this file, the project's AGENTS.md / CLAUDE.md, and only what the handoff does not answer.
2. `git status --short` and `git log --oneline -8` in the lead checkout; the same in the worker checkout.
3. `ls -t .agent-lead/briefs | head`: the newest brief, and whether its `.report.md` exists.
4. `node <skill>/tools/prompts.mjs --missing`: write any brief it lists before anything else. Find the first open
   item in the checklist. Rebuild the checklist page if the plan changed since its last publish.
5. Tell the user in two or three lines where things stand and what comes next (and the next prompt in Handoff mode).

## 4. Commands
| Purpose | Command |
| --- | --- |
| Install (lead only) | |
| Dev server (lead uses port <n>, worker <m>) | |
| Next item, with the files to read | `node <skill>/tools/next.mjs` |
| Quick check (must pass before every commit) | `node <skill>/tools/check.mjs` |
| Ship one item (checks, plan, page, commit) | `node <skill>/tools/ship.mjs "<item text>" "<subject>" --coauthor "<worker> <email>"` |
| Every worker prompt, from the briefs | `node <skill>/tools/prompts.mjs` (`--all`, `--worker <name>`, `--missing`) |
| Mechanical review (run first, no tokens) | `node <skill>/tools/verify.mjs <brief>` in the worker's checkout (`--tests-only` for a tests-first round) |
| Merge the worker's branch | `node <skill>/tools/land.mjs <worker branch>` |
| Repo map (rebuilt by ship) | `node <skill>/tools/map.mjs` → `.agent-lead/repo-map.md` |
| Parallel workers | `node <skill>/tools/worker.mjs add\|list\|remove <name>` |
| Issues into the plan | `node <skill>/tools/intake.mjs [--label <l>] [--dry]` |
| Session handoff (written by ship) | `node <skill>/tools/handoff.mjs` → `.agent-lead/handoff.md` |
| Real input in the app, screenshots | `node <skill>/tools/play.mjs --url <dev url> <steps>` |
| The reference product (if any) | `node <skill>/tools/observe.mjs <steps>` |
| Layout, tap-target and contrast audit | `node <skill>/tools/audit-ui.mjs --routes "/,…"` |
| Shared resource lock (parallel workers) | `node <skill>/tools/lock.mjs take\|release <name> <holder>` |
| Worker launcher (Pane/launched mode) | <absolute runtime path>/agent-run <cli> <brief> --cd <worker checkout> |
| Worker status (Codex) | `node <runtime>/agent-view.mjs --json` (log: <absolute path>/live.log) |
| Checklist page (rebuild, then republish to the URL above) | `node <skill>/plan-page.mjs <plan.md> .agent-lead/checklist.html --title "<Project> plan"` |

## 5. Conventions
- Commit style: <e.g. "feat: … (M2, FR-07)">. One commit per item or part. Worker trailer:
  `Co-Authored-By: <worker> <email>`.
- Never push, deploy or publish unless the user asks.
- Project rules that briefs must repeat: <design tokens, accessibility level, languages, no new dependencies…>.

## 5b. The focus rule (finish before you move on)
Complete the task you are on before moving to another one. Stay in the phase (milestone) you are in. Only after every
task of that phase is complete may the next phase start, then repeat. Briefs come from the lowest phase that still has
an open task. A worker finishes its whole brief before it gets another; when it stops early the next agent continues the
same brief. Before moving on, re-read the phase's items and confirm each is done, or partial with the open check named.

## 6. Review focus for this project
<What matters most here: UI screenshots at phone and desktop, API contracts, migrations, accuracy bars, etc.>

## 7. Things learned (pitfalls; add as you hit them)
- 

## 8. Current state (update after every landed item)
- As of <date> (<lead branch> at <hash>): <milestone and item>. Worker: <brief, state>. Lead: <parallel work>.
- Open questions to the user: <…>
