#!/usr/bin/env bash
# Installs the /lead command for Claude Code, without the plugin prefix (/lead, not /agent-lead:lead).
# Plugin commands always carry the plugin's name; only a command in your own commands folder is plain /lead.
# Run it once per machine, and again after a plugin update to refresh it:
#   bash <plugin>/skills/agent-lead/install-lead.sh
# An existing, different ~/.claude/commands/lead.md is backed up to lead.md.bak-agent-lead first.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/commands"
dest="$dir/lead.md"
mkdir -p "$dir"
if [ -f "$dest" ] && ! cmp -s "$here/lead-command.md" "$dest" && [ ! -f "$dest.bak-agent-lead" ]; then
  cp "$dest" "$dest.bak-agent-lead"
  echo "✔ backed up the old command to $dest.bak-agent-lead"
fi
cp "$here/lead-command.md" "$dest"
echo "✔ installed /lead in $dest (run /reload-plugins or restart Claude Code)"
