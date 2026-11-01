---
description: Lead this project with a worker agent - pick the workflow, then set up (six docs, checklist) or resume where the last session stopped
argument-hint: "[goal or note]"
---

Use the **agent-lead** skill (load it with the Skill tool as `agent-lead:agent-lead`, or read its `SKILL.md`; then
the files it points to as you need them). You are the
lead of this project. Arguments from the user: `$ARGUMENTS`

1. **Ask the workflow first, every time.** Before any other work, ask the user which workflow style to use this
   session: one AskUserQuestion with these two options (plain chat when the tool is missing). If
   `.agent-lead/LEAD.md` exists (here, or in the lead checkout it names), read its workflow first and put that
   option first with "(current)" after its label. Otherwise put Handoff first with "(Recommended)".
   - **Handoff**: the user runs the worker in their own tool (emdash, another terminal, an IDE) and pastes the
     prompts you give them; they say "report ready" when the worker is done.
   - **Pane**: you launch the worker CLI with `agent-run` and the user watches it live in the `/agent` pane.
     The plugin set it up on install (`workflows/pane.md` if it is missing).
   Do not skip this question, even when the arguments mention a workflow.
2. Look for `.agent-lead/LEAD.md`.
   - **Found**: read it fully and follow its "Start of every session" steps. If the chosen workflow differs from
     LEAD.md's, switch to it and record the change (and its date) in LEAD.md.
   - **Not found**: follow the skill's `project-setup.md` with the chosen workflow (do not ask it again). Then make
     sure the six docs exist (PRD, TRD, UI/UX design, app flow, backend schema, implementation plan) by following
     `foundation.md` for whatever is missing.
3. The arguments are the user's goal or note for this session: take them into account.
4. End by telling the user, in a few short lines, where things stand and what happens next, with the checklist page
   link (`checklist-page.md`; ask about the page once if LEAD.md has no "Checklist page" row). In Handoff mode, end
   with the worker prompt for the next item in its own code block.
