---
description: Lead this project with a worker agent - pick the workflow, then set up (six docs, checklist) or resume where the last session stopped
argument-hint: "[goal or note]"
---

Use the **agent-lead** skill (load it with the Skill tool as `agent-lead:agent-lead`, or read its `SKILL.md`; then
the files it points to as you need them). You are the
lead of this project. Arguments from the user: `$ARGUMENTS`. In Codex, use the message accompanying `$lead` as
the arguments and read `workflows/codex.md` before following the shared procedure. Use Codex's available question
tool and launcher/status paths; the launched-worker choice uses a terminal viewer instead of a Claude pane.

1. **Settle the workflow.** If `.agent-lead/LEAD.md` exists (here, or in the lead checkout it names), use its
   workflow and say which in one line; ask only when the arguments ask to switch. If it does not exist, ask once
   with one AskUserQuestion (plain chat when the tool is missing), Handoff first with "(Recommended)":
   - **Handoff**: the user runs the worker in their own tool (emdash, another terminal, an IDE) and pastes the
     prompts you give them; they say "report ready" when the worker is done.
   - **Pane**: you launch the worker CLI with `agent-run` and the user watches it live in the `/agent` pane.
     The plugin set it up on install (`workflows/pane.md` if it is missing).
2. Look for `.agent-lead/LEAD.md`.
   - **Found**: read it fully and follow its "Start of every session" steps. If the chosen workflow differs from
     LEAD.md's, switch to it and record the change (and its date) in LEAD.md.
   - **Not found**: follow the skill's `project-setup.md` with the chosen workflow (do not ask it again). It picks
     the track: Full (the six docs, `foundation.md` for whatever is missing) or Light (one plan file).
3. The arguments are the user's goal or note for this session: take them into account.
4. End by telling the user, in a few short lines, where things stand and what happens next, with the checklist page
   link (`checklist-page.md`; ask about the page once if LEAD.md has no "Checklist page" row). In Handoff mode, end
   with the worker prompt for the next item in its own code block.
