#!/usr/bin/env bash
# Runs at the start of every Claude Code session (SessionStart hook) and sets agent-lead up once per plugin
# version, so installing the plugin is the only step a user takes:
#   - installs the plain /lead command (install-lead.sh)
#   - installs agent-run, run-agent.sh and the worker rules, and their allow rules (setup.sh)
# After that it only compares a version marker and exits, silently. A plugin update runs it again.
# Log: ~/.claude/agent-runs/setup.log. It never fails the session.
root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
skill="$root/skills/agent-lead"
dir="$HOME/.claude/agent-runs"
marker="${CLAUDE_PLUGIN_DATA:-$dir}/installed-version"
version="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$root/.claude-plugin/plugin.json" | head -1)"
commands="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/commands/lead.md"

if [ -f "$marker" ] && [ "$(cat "$marker")" = "$version" ] && [ -f "$commands" ]; then exit 0; fi

mkdir -p "$dir" "$(dirname "$marker")"
{
  echo "== agent-lead $version first run, $(date '+%Y-%m-%d %H:%M:%S')"
  bash "$skill/install-lead.sh" && bash "$skill/setup.sh"
} >>"$dir/setup.log" 2>&1
status=$?
if [ $status -eq 0 ]; then
  echo "$version" >"$marker"
  echo "agent-lead $version is set up: /lead is installed (run /reload-plugins once if it is not in the menu yet). Pane-mode scripts are in $dir."
else
  echo "agent-lead $version setup did not finish (see $dir/setup.log). /lead may still work; tell the user."
fi
exit 0
