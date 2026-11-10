---
name: lead
description: Start or resume leading a project with a worker agent. Choose Handoff or a launched worker, then use the agent-lead workflow for briefs, review, and commits.
---

In the desktop app, type `/lead` and select Lead from the slash menu. CLI/IDE users can invoke `$lead`.

Read [the command procedure](../agent-lead/lead-command.md) and follow it. The user's message after invoking
this skill is the goal; `$ARGUMENTS` in the shared procedure means that message, not a literal placeholder.
Load [agent-lead](../agent-lead/SKILL.md) and read [the Codex adapter](../agent-lead/workflows/codex.md)
when running in Codex. Resolve references from those files' own directories.

Ask the workflow question only when the project has no `.agent-lead/LEAD.md` or the user asks to switch; otherwise
use the recorded workflow. Use the question tool available in this session, or plain chat if none is available.
