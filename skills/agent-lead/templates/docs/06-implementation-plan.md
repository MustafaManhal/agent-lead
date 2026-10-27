# 06. Implementation plan

<!-- The checklist. Status markers: [ ] open, [~] partial (with a dated note), [x] done and verified. Work strictly in
     order: milestone by milestone, item by item, part by part. Each item is one worker run and one commit. -->

## 1. Ground rules
- The lead keeps this file current; the worker never edits it.
- Every item cites the requirements it delivers (FR-xx, NFR-xx) and ends with the project's `check` passing.
- New findings become new items here, not code.

## 2. Repository layout
<The folders from the TRD and what goes where.>

## 3. Milestones

### M0. Foundation
- [ ] Repository, README, `.env.example`, framework scaffold, pinned versions.
- [ ] Format, lint, typecheck, unit tests, one Playwright end-to-end test, one `check` command, CI.
- [ ] Design tokens and base components from 03-UI-UX.md (light and dark if planned).
- [ ] Data layer and API skeleton from 05-backend-schema.md, one real endpoint end to end.
- [ ] Dev tools: seed data, `tools/shot.mjs`, fixtures folder; agent pointers (AGENTS.md, CLAUDE.md).

### M1. <Name> (FR-01, FR-02, …)
- [ ] <Item: the user-visible result, the FRs, how it is checked.>
  **In order:** [ ] a. <part> [ ] b. <part>

### M2. <Name> (FR-…)
- [ ] 

## 4. Owner tasks
<Things only the user can do: accounts, payments, keys, store listings, legal text. With the milestone that needs them.>
- [ ] 

## 5. Definition of done (every item)
- Meets its FRs and the brief; `check` passes; tests cover the new logic.
- Checked in the running app with real input (phone and desktop width; light and dark when planned).
- No console errors; accessibility basics hold; docs updated if behaviour changed.
- Reviewed by the lead and committed with the item's name.

## 6. Risks to watch during the build
