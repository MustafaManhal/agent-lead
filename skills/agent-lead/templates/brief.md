# Task <NN>: <item name> (<milestone>, <FR-xx, …>)

Read `<lead checkout>/.agent-lead/WORKER.md` first. <One or two lines: what already landed that this builds on,
with commit hashes and file names. Which files the lead owns right now, if any.>

## Goal
<The user-visible result in two or three sentences. Why it matters (the FRs).>

## Research first
- <What to look at before building: the reference product's screens, the official docs page, a real data sample.>
- Save notes to `<research/topic.md>` and samples to `<fixtures/…>`.

## Build
1. <Concrete change, with file paths, names, data shapes, tokens, states.>
2. <…>

## Check it yourself
- <The scene to set up and the steps to take with real input; the screenshots to take (names).>
- <The edge cases: empty, error, long text, offline, phone width, dark.>

## Tests
- <What the tests must cover, including a negative case.>

## Done when
- <The exact conditions the lead will check.>

## Report
Write `<lead checkout>/.agent-lead/briefs/<NN>-<item>.report.md` as WORKER.md says. `<check command>` must pass.
If you run out of quota, write the report anyway with what is done and what is left. Then stop.
