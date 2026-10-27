# Reviewing a worker's report

Never take a report on trust: workers report work they did not do, skip the hard check, or guess where they should
have looked. Review in this order, and keep it cheap (short outputs, the parts of files you need).

## 1. The report against the brief

- Every numbered point of the brief has an answer: done, or "not done" with a reason.
- The research the brief asked for is there (notes file, fixtures, screenshots of the reference), not described
  from memory.
- Every check the brief asked for was run, with its exact output: tests, typecheck, lint, build, the in-app check.
- "Left or unsure" is filled in. An empty one on a big item is a warning sign.

## 2. The diff against the report

- `git -C <worker> status --short` and `git -C <worker> diff --stat`: every file the report lists, and nothing it
  does not. New files are untracked: list them too.
- No changes outside the item's scope, no reformatting of untouched lines, no new dependencies, no edits to the
  checklist, `.agent-lead/` or the project's docs unless the brief asked.
- No secrets, keys, personal data or large generated files.

## 3. Run the checks yourself

The project's check commands from LEAD.md, in the worker's checkout. They must pass. Then the slow ones the worker may
have skipped (full test suite, build). Note the numbers (for example "214 tests passed").

## 4. Read the risky parts

Read, do not skim: new modules with the core logic, data formats and migrations (old data must still load; a
schema change needs a migration), anything touching auth, payments, permissions or user data, import and export
code, concurrency. Look for:

- Dead code kept "for history", commented-out blocks, TODO stubs presented as done.
- Two sources of truth after a migration.
- Rules or matchers that fire on everything (test with a case that should not match).
- Guessed external formats or APIs where the brief asked for a real sample.
- UI that only works in the test scene, hard-coded sizes or colors where the project has tokens.
- Errors swallowed silently, missing empty and error states.

## 5. See it working

- Open two or three of the worker's screenshots (Read the image). Look for clipped text, overflow, wrong
  placement, blank canvases, a state the brief asked for that is missing.
- For UI changes, check one thing yourself with real input (`playwright.md`): the main path at phone and desktop
  width, light and dark when the project has both, keyboard focus. For APIs, one real request and one bad request.
- Compare with the reference the brief named (design, spec, the other product's behaviour).

## 6. Decide

- **Ship** when it meets the brief and the checks pass (SKILL.md section 3).
- **Review round** when anything material is wrong or missing. Write `<brief>-2.md` from `templates/review-round.md`:
  numbered points, each with what is wrong (file, line, screenshot), what it must be, and how you will check it.
  Point out what was good in one line, then the problems. No vague notes ("polish the UI").
- **Move it on** when the leftover belongs to the next item: put it in the next brief's "First" section and in the
  checklist note.
- Do not fix the worker's code yourself, not even small things, unless LEAD.md says this project allows it or the
  user asks. One-line typos you may fix while committing; say so in the commit message.

## 7. Tell the user

What you checked and the result, the problems you found in plain words (what a user of the product would see), and
the decision. Then the next prompt (Handoff) or the next run (Pane).
