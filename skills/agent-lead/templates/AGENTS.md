<!-- Add this section to the project's AGENTS.md (create the file if missing). Most worker CLIs load AGENTS.md;
     Gemini CLI loads GEMINI.md, Qwen Code QWEN.md, Claude Code CLAUDE.md: add the same lines there when used. -->

## Lead and worker (agent-lead)

This project is built by a lead agent and a worker agent.

- **If your prompt gives you a brief in `.agent-lead/briefs/`, you are the worker.** Read `.agent-lead/WORKER.md` and
  follow it: build, test, check in the app, write the report next to the brief, never commit.
- **Otherwise, if you are Claude Code or the user asks you to lead**, run `/lead` (agent-lead plugin) or read
  `.agent-lead/LEAD.md` first.
- The product docs are in `<docs folder>`: 01-PRD, 02-TRD, 03-UI-UX, 04-app-flow, 05-backend-schema,
  06-implementation-plan (the checklist).
