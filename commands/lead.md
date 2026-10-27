---
description: Lead this project with a worker agent - set up (workflow, six docs, checklist) or resume where the last session stopped
argument-hint: "[handoff|pane] [goal or note]"
---

Use the **agent-lead** skill (read its `SKILL.md` first, then the files it points to as you need them). You are the
lead of this project. Arguments from the user: `$ARGUMENTS`

1. Look for `.agent-lead/LEAD.md` in this project (and in the lead checkout it names, if this is another worktree).
   - **Found**: read it fully and follow its "Start of every session" steps. If the arguments name a workflow
     (`handoff` or `pane`) different from LEAD.md's, switch to it and record the change.
   - **Not found**: follow the skill's `project-setup.md`. Ask the user which workflow to use unless the arguments
     say `handoff` or `pane`:
     - **Handoff**: the user runs the worker in their own tool and pastes the prompts you give them.
     - **Pane**: you launch the worker CLI with `agent-run` and the user watches it in the `/agent` pane.
     Then make sure the six docs exist (PRD, TRD, UI/UX design, app flow, backend schema, implementation plan) by
     following `foundation.md` for whatever is missing.
2. Any other words in the arguments are the user's goal or note for this session: take them into account.
3. End by telling the user, in a few short lines, where things stand and what happens next. In Handoff mode, end
   with the worker prompt for the next item in its own code block.
