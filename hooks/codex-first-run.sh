#!/usr/bin/env bash
# Codex hook: install worker tools without changing approval rules or Claude settings.
# Hooks run only after the user trusts them. $lead also works without this hook.
set -uo pipefail
root="${PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
if ! node "$root/skills/agent-lead/install-codex.mjs" --skills; then
  echo "agent-lead setup did not finish. Run node <plugin>/skills/agent-lead/install-codex.mjs --skills to retry." >&2
fi
exit 0
