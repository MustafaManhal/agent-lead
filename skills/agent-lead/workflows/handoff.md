# Handoff workflow: the user runs the worker, you lead

The user runs the worker in their own tool (emdash, a second terminal, an IDE, another Claude Code session, a cloud
agent on the same machine) and pastes your prompts into it. You never start the worker yourself. Use it when the user
wants to watch several agents side by side, or uses a worker `agent-run` does not launch.

## Prompts (copy these shapes exactly; fill the absolute paths from LEAD.md)

New item:
```
You are the worker. Read <lead checkout>/.agent-lead/WORKER.md, then do the task in <lead checkout>/.agent-lead/briefs/<NN>-<item>.md. Work only in <worker checkout>. Never commit. When done, or if you run out of quota, write <lead checkout>/.agent-lead/briefs/<NN>-<item>.report.md as WORKER.md says, then stop.
```

Review round:
```
Read <lead checkout>/.agent-lead/briefs/<NN>-<item>-2.md (review notes) and fix those points. Follow <lead checkout>/.agent-lead/WORKER.md. Never commit. Add a "Round 2" section to <lead checkout>/.agent-lead/briefs/<NN>-<item>.report.md when done, or if you run out of quota, then stop.
```

Continue someone else's partial work:
```
You are the worker. Read <lead checkout>/.agent-lead/WORKER.md and <brief>. Part of the task is already done in <worker checkout> (see git diff there). Finish the rest, then write <report> as WORKER.md says, then stop.
```

Give each prompt alone in a code block, and say in one line which session it goes to ("paste this in the worker
session"). Use absolute paths: the worker's working folder differs from yours.

## The cycle

1. You write the brief and give the prompt. Tell the user what the item is in one line.
2. While the worker runs, you may do parallel lead work if the user asked for it (SKILL.md section 6), or wait. Do
   not poll the worker's checkout in a loop.
3. The user says "report ready" (or "done", "finished"):
   - Read `<brief>.report.md`. Missing: look at the worker's checkout (`git status --short`, `git diff --stat`) and
     tell the user what you see (nothing yet / partial work, no report) before doing anything else.
   - Review (`review.md`).
4. Then either give the review-round prompt, or ship (SKILL.md section 3) and give the next item's prompt.

## Keeping the worker's checkout right

- After you land an item, fast-forward the worker's checkout to the lead branch (`git -C <worker> merge --ff-only
  <lead branch>`) so the next brief builds on it. Never while it has uncommitted work.
- Before landing, make sure the worker's branch is the one you reviewed: `git -C <worker> log --oneline -1` and
  `git -C <worker> status --short` match what the report describes.
- If the user's tool made the worker's checkout (for example emdash creates its own worktrees), record its path and
  branch in LEAD.md. If the tool made it from an old base, ask before fast-forwarding.

## When the user says the worker hit its limit

Check the worker's checkout, then follow SKILL.md section 7. When switching models, give the same prompt again (or the
"continue" prompt for partial work) and note the model in the report's header and in status.md.

## What the worker can do in this mode

The worker runs interactively under the user's control, so it can use the project's real tools: dev server, tests,
browser checks, screenshots, the project's own scripts. WORKER.md lists what is expected and what is off limits. It
still never commits, pushes, merges, switches branches, installs packages or edits the lead's files.
