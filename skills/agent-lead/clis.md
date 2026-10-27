# Worker CLIs

In Pane mode use `agent-run` for the CLIs it knows; this table shows what it runs underneath, for debugging or for
running a CLI by hand. In Handoff mode the user runs the worker their own way; the "rules file" column tells you
where the pointer to `.agent-lead/WORKER.md` must go so the worker loads it.

| CLI | Headless run with live events | Follow-up in the same session | Rules file it loads |
| --- | --- | --- | --- |
| agy (Antigravity) | `agy -p "<brief>" --mode accept-edits --output-format stream-json` (add `--remote-control` for its browser view) | `--conversation <conversation_id>` | `AGENTS.md`, `GEMINI.md`, `.agents/rules/*.md` |
| Claude Code | `claude -p "<brief>" --output-format stream-json --verbose --permission-mode acceptEdits` | `--resume <session_id>` | `CLAUDE.md` |
| Codex | `codex exec --json --sandbox workspace-write "<brief>"` | `codex exec resume <thread_id> --json "<fixes>"` | `AGENTS.md` |
| Gemini CLI, Qwen Code | `gemini -p "<brief>" --output-format stream-json --approval-mode auto_edit` (Qwen: `qwen`, same flags) | `--resume latest` | `GEMINI.md` (Qwen: `QWEN.md`) |
| OpenCode | `opencode run --format json --model <provider/model> "<brief>"` (a model is required) | `--session <sessionID>` | `AGENTS.md` |
| Cursor Agent | `cursor-agent -p --trust --output-format stream-json "<brief>"` | `--resume <session_id>` | `AGENTS.md`, `.cursor/rules/` |
| Any other CLI (Aider, Amp, Droid, Copilot CLI, Kimi, Goose, Crush, …) | its print or headless mode; use a JSON stream flag if it has one | its own resume flag | its own convention |

Notes:

- A second Claude Code as the worker loads `CLAUDE.md`, which tells Claude sessions to lead. The setup step adds a
  line there: "if your prompt gives you a brief in `.agent-lead/briefs/`, you are the worker". Keep it.
- The pane reads every format above; output it does not recognise still shows line by line, so any CLI works.
- These CLIs change often. Check `<cli> --help` when a flag fails.
- Pick the model on purpose for design work or changes across many files. A cheap low-effort run once did shallow
  work and reported changes it never made.
- Quotas belong to the worker's own account (agy: `agy -p "/usage"`; others: their usage page). Per-request plans
  (for example GitHub Copilot models in OpenCode) suit long runs better than per-token free tiers.
- Free models may keep or train on the code. Tell the user before suggesting one for a private project.
