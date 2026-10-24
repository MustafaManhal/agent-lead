#!/usr/bin/env bash
# One-time setup for agent-lead, per machine. Run it yourself once, then never again:
#   bash <plugin>/skills/agent-lead/setup.sh
# It is safe to run again (it only adds what is missing) and backs up every file it changes
# to <file>.bak-agent-lead the first time.
#
# 1. Installs agent-run, run-agent.sh and the worker rules into ~/.claude/agent-runs/.
# 2. Lets Claude Code run them in every project: adds allow rules to ~/.claude/settings.json.
# 3. For worker CLIs that read their allow list from a file (agy, Cursor Agent), adds the safe
#    command set to that file. Claude Code, Codex, Gemini CLI, Qwen Code and OpenCode get their
#    limits per run from agent-run, so their files are not touched.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dest="$HOME/.claude/agent-runs"
command -v node >/dev/null || { echo "setup: Node.js is needed to edit the JSON settings files" >&2; exit 1; }

mkdir -p "$dest"
cp "$here/agent-run" "$here/run-agent.sh" "$here/worker-rules.md" "$dest/"
chmod +x "$dest/agent-run" "$dest/run-agent.sh"
echo "✔ installed agent-run, run-agent.sh and worker-rules.md in $dest"

# Adds entries to a JSON array at a path in a settings file, creating what is missing.
add_allow() {
  local file="$1" path="$2"; shift 2
  mkdir -p "$(dirname "$file")"
  [ -f "$file" ] && [ ! -f "$file.bak-agent-lead" ] && cp "$file" "$file.bak-agent-lead"
  node - "$file" "$path" "$@" <<'NODE'
const fs = require('fs')
const [file, path, ...items] = process.argv.slice(2)
const data = fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim() ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
let node = data
const keys = path.split('.')
for (const key of keys.slice(0, -1)) node = node[key] ??= {}
const last = keys[keys.length - 1]
const list = (node[last] ??= [])
const added = items.filter(item => !list.includes(item))
list.push(...added)
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
console.log(`✔ ${file}: ${added.length ? 'added ' + added.length + ' rule(s)' : 'already set'}`)
NODE
}

add_allow "$HOME/.claude/settings.json" permissions.allow \
  "Bash($dest/agent-run:*)" "Bash(~/.claude/agent-runs/agent-run:*)" \
  "Bash($dest/run-agent.sh:*)" "Bash(~/.claude/agent-runs/run-agent.sh:*)"

safe=(ls pwd cat head tail wc find grep rg tree diff file "git status" "git diff" "git log" "git show" "git branch" "npm test" "npm run lint" "npm run typecheck" "npm run build")

if command -v agy >/dev/null; then
  rules=(); for c in "${safe[@]}"; do rules+=("command($c)"); done
  add_allow "$HOME/.gemini/antigravity-cli/settings.json" permissions.allow "${rules[@]}"
else
  echo "· agy not installed: skipped"
fi

if command -v cursor-agent >/dev/null; then
  rules=(); for c in "${safe[@]}"; do rules+=("Shell($c)"); done
  add_allow "$HOME/.cursor/cli-config.json" permissions.allow "${rules[@]}"
else
  echo "· cursor-agent not installed: skipped"
fi

echo
echo "Done. Restart Claude Code (or run /reload-plugins) so it reads the new allow rules."
echo "From now on, ask Claude: \"have <cli> build X, you review, I watch\" and open /agent."
