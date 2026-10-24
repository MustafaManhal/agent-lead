# Rules for the worker agent in this repository

You are the implementer. A lead agent wrote your brief and reviews every change you make; the owner watches your work live. Do exactly what the brief asks, nothing more.

## The project

<!-- Fill in: what the project is, the stack, where the docs live. Three to six lines.
     Save this file where your worker loads it: AGENTS.md (Codex, OpenCode, Cursor, agy), .agents/rules/AGENTS.md (agy),
     CLAUDE.md (Claude Code), GEMINI.md (Gemini CLI), QWEN.md (Qwen Code). Keep one copy and link the others to it. -->

## Code style

<!-- Fill in: the design tokens or class names to use, components to reuse, and the bar every change must meet. Example: -->
- Use the project's design tokens; never hard-code colors.
- Reuse existing components before writing new ones.
- Every UI change works at 320px phone width and in light and dark themes.
- Accessibility: WCAG 2.2 AA contrast, real labels on controls, decorative elements `aria-hidden`, touch targets at least 44px.
- Match the surrounding code: naming, comment density, formatting. Do not reformat lines you did not change. No new dependencies.

## Commands

You may run only these (the same list the user allowed in your CLI's settings): `ls`, `pwd`, `cat`, `head`, `tail`, `wc`, `find`, `grep`, `rg`, `tree`, `diff`, `file`, `git status`, `git diff`, `git log`, `git show`, `git branch`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Anything else is refused, and one refused command ends your whole run.

- Never put square brackets in a command: `git diff app/[id]/page.tsx` is refused. Run `git diff` with no path instead.
- Read, list, search and edit files with your file tools, never the shell. `sed`, `awk`, `echo >`, `python` and `node -e` are refused and end your run.
- Never commit, push, merge, switch branches, install packages or delete files. The lead does that.

## When you finish

Run `npm run lint` and `npm run typecheck`, then reply with:
1. Each change: the file, what changed and why.
2. The lint and typecheck results, copied exactly.
3. Anything you were unsure about or did not do. Never claim work you did not do.
