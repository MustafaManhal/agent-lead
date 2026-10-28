# Lead playbook for <project>

Read this whole file at the start of every lead session (`/lead` does it). It is everything a new session needs to
continue without the earlier conversations. The method is the agent-lead skill; this file holds this project's
facts. Keep section 8 current.

## 1. Workflow
- Mode: <Handoff | Pane>. Worker: <agent and model>. Changed on <date> because <reason>.
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
1. Read this file, the project's AGENTS.md / CLAUDE.md, and the tail of `.agent-lead/status.md`.
2. `git status --short` and `git log --oneline -8` in the lead checkout; the same in the worker checkout.
3. `ls -t .agent-lead/briefs | head`: the newest brief, and whether its `.report.md` exists.
4. Find the first open item in the checklist. Rebuild the checklist page if the plan changed since its last publish.
5. Tell the user in two or three lines where things stand and what comes next (and the next prompt in Handoff mode).

## 4. Commands
| Purpose | Command |
| --- | --- |
| Install (lead only) | |
| Dev server (lead uses port <n>, worker <m>) | |
| Quick check (must pass before every commit) | |
| Tests / lint / typecheck / build | |
| Screenshots | `node tools/shot.mjs <url> <out>` |
| Checklist page (rebuild, then republish to the URL above) | `node <skill>/plan-page.mjs <plan.md> .agent-lead/checklist.html --title "<Project> plan"` |

## 5. Conventions
- Commit style: <e.g. "feat: … (M2, FR-07)">. One commit per item or part. Worker trailer:
  `Co-Authored-By: <worker> <email>`.
- Never push, deploy or publish unless the user asks.
- Project rules that briefs must repeat: <design tokens, accessibility level, languages, no new dependencies…>.

## 6. Review focus for this project
<What matters most here: UI screenshots at phone and desktop, API contracts, migrations, accuracy bars, etc.>

## 7. Things learned (pitfalls; add as you hit them)
- 

## 8. Current state (update after every landed item)
- As of <date> (<lead branch> at <hash>): <milestone and item>. Worker: <brief, state>. Lead: <parallel work>.
- Open questions to the user: <…>
