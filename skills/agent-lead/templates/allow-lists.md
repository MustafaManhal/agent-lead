# What the worker may run without asking

A headless worker cannot ask for permission, so it needs an allow list. Start from the safe set below (reading, looking around, git read-only, tests, lint, typecheck, build) and keep destructive or outward commands off it: `rm`, `mv`, `chmod`, `sudo`, `git commit`/`push`/`merge`/`checkout`, `npm install`, `npx <pkg>`, `curl`, `wget`, plain `node <file>`. Only the user edits these files.

The safe set: `ls`, `pwd`, `cat`, `head`, `tail`, `wc`, `find`, `grep`, `rg`, `tree`, `diff`, `file`, `git status`, `git diff`, `git log`, `git show`, `git branch`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

## agy (Antigravity CLI)

`~/.gemini/antigravity-cli/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "command(ls)", "command(pwd)", "command(cat)", "command(head)", "command(tail)", "command(wc)",
      "command(find)", "command(grep)", "command(rg)", "command(tree)", "command(diff)", "command(file)",
      "command(git status)", "command(git diff)", "command(git log)", "command(git show)", "command(git branch)",
      "command(npm test)", "command(npm run lint)", "command(npm run typecheck)", "command(npm run build)"
    ]
  }
}
```

A rule matches the command with any arguments (`command(ls)` allows `ls -la`).

## Claude Code (as the worker)

Pass the list per run, or put it in the worktree's `.claude/settings.json` under `permissions.allow`:

```
--permission-mode acceptEdits --allowedTools "Read" "Grep" "Glob" "Bash(ls:*)" "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(npm test:*)" "Bash(npm run lint:*)" "Bash(npm run typecheck:*)" "Bash(npm run build:*)"
```

## Codex

Codex runs commands inside its sandbox instead of an allow list. Use `--sandbox workspace-write` (it can edit the worktree, not the rest of the disk, and has no network by default). Never `danger-full-access`.

## Gemini CLI and Qwen Code

`--approval-mode auto_edit` approves file edits only; shell commands are refused in headless mode unless allowed. Allow commands through the CLI's policy engine (see its docs) or, on older versions, `--allowed-tools "run_shell_command(npm test)"`. Never `--approval-mode yolo`.

## OpenCode

`opencode.json` in the worktree (or `~/.config/opencode/opencode.json`):

```json
{
  "permission": {
    "edit": "allow",
    "bash": {
      "*": "deny",
      "ls*": "allow", "git status*": "allow", "git diff*": "allow", "git log*": "allow",
      "npm test*": "allow", "npm run lint*": "allow", "npm run typecheck*": "allow", "npm run build*": "allow"
    }
  }
}
```

## Cursor Agent

`~/.cursor/cli-config.json`:

```json
{
  "permissions": {
    "allow": ["Shell(ls)", "Shell(git status)", "Shell(git diff)", "Shell(git log)", "Shell(npm test)", "Shell(npm run lint)", "Shell(npm run typecheck)", "Shell(npm run build)"],
    "deny": ["Shell(rm)", "Shell(git push)", "Shell(curl)"]
  }
}
```

Do not pass `--force`: it allows every command not denied.

## Any other CLI

Find its permission or approval setting in `--help` or its docs, and mirror the safe set above. If it has no allow list, run it in a sandbox or a throwaway worktree and review everything.
