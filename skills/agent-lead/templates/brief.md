# Task <NN>: <item name> (<milestone>, <FR-xx, …>)

Item: <the plan item's first words, copied exactly, so the checklist page can show this prompt at that task>
Worker: <worker-1 | worker-2 | …>
Size: <easy | hard>. Model: <from LEAD.md section 1>.

Read `<lead checkout>/.agent-lead/WORKER.md` first. <One or two lines: what this builds on ("item NN" when
written ahead; the commit hashes and file names once that item has landed). Which files the lead owns right now, if any.>

Find files through `.agent-lead/repo-map.md` before searching. Your dev server port is `$AGENT_LEAD_PORT` when set.

## Goal
<The user-visible result in two or three sentences. Why it matters (the FRs).>

## Research first
- <What to look at before building: the reference product's screens, the official docs page, a real data sample.>
- Save notes to `<research/topic.md>` and samples to `<fixtures/…>`.

## Build
1. <Concrete change, with file paths, names, data shapes, tokens, states.>
2. <…>

## Files
<What you may create or change, as backticked paths: `src/settings/` (a folder), `src/theme.ts`, `tests/*`. Nothing
else. Test files are always allowed.>

## Check it yourself
- <The scene to set up and the steps to take with real input; the screenshots to take (names).>
- <The edge cases: empty, error, long text, offline, phone width, dark.>

## Tests
<Tests-first items: this brief is only this section. Write failing tests from the spec, no product code, report,
stop. The build comes as a review round after the lead approves the tests; you may not change them then.>
- <What the tests must cover, including a negative case.>

## Done when
- <The exact conditions the lead will check.>

## Report
Write `<lead checkout>/.agent-lead/briefs/<NN>-<item>.report.md` as WORKER.md says. `<check command>` must pass.
If you run out of quota, write the report anyway with what is done and what is left. Then stop.
