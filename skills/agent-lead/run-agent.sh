#!/usr/bin/env bash
# Runs any coding agent CLI and records its output for the /agent pane.
#   run-agent.sh <agent-name> <command> [args...]
# Example: run-agent.sh codex codex exec --json --sandbox workspace-write "$(cat brief.md)"
# Writes ~/.claude/agent-runs/live.log (override with AGENT_LEAD_LOG): a start line, every line
# the CLI prints (stdout and stderr), then an end line with the exit code. Prints the last lines
# of the log when the run ends and exits with the CLI's own exit code.
set -uo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: run-agent.sh <agent-name> <command> [args...]" >&2
  exit 2
fi

agent="$1"
shift
log="${AGENT_LEAD_LOG:-$HOME/.claude/agent-runs/live.log}"
mkdir -p "$(dirname "$log")"

now() { echo "$(date +%s)000"; }
json() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

{
  printf '{"lead":"start","agent":"%s","cwd":"%s","at":%s}\n' "$(json "$agent")" "$(json "$PWD")" "$(now)"
  "$@" 2>&1 </dev/null
  code=$?
  printf '{"lead":"end","code":%s,"at":%s}\n' "$code" "$(now)"
  exit "$code"
} | tee "$log" >/dev/null
code=$?

tail -n "${AGENT_LEAD_TAIL:-25}" "$log"
exit "$code"
