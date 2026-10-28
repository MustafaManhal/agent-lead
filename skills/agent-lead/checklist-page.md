# The checklist page

Every project the lead runs gets a checklist page: one HTML page built from the implementation plan, so the user
can see progress at a glance and so can anyone they share it with. It shows the overall percent and counts, the next
item, a row of milestone buttons with their progress, and one card per milestone. Finished milestones, and the
finished items inside open ones, fold away. Long item notes sit behind "Details". Expand all, Collapse all and Hide
done work in any browser, and the page keeps which cards were open. It has light and dark themes and fits a phone.

It is part of the workflow, not an extra: set it up on the first `/lead`, rebuild it every time the checklist
changes, and give the user the link with every progress report.

## 1. Ask once (project setup)

The page is published under the user's account, so ask before the first publish. Use one AskUserQuestion (with the
setup questions if a slot is free, otherwise right after them):

- "Publish a private checklist page (recommended)": built from the plan and published with the Artifact tool to
  one link that stays the same. Private: only the user can open it until they share it from the page's Share menu.
- "Keep it as a local file": `.agent-lead/checklist.html`, rebuilt the same way; the user opens it in a browser.
- "No checklist page": the plan file is enough.

Without the Artifact tool, offer only the last two. Record the answer in LEAD.md section 2 ("Checklist page": the
URL, `local: .agent-lead/checklist.html`, or `declined <date>`). An existing project whose LEAD.md has no such row
gets the question once, at the start of the next session. A user who declined is not asked again unless they bring
it up.

## 2. Build

```bash
node <skill>/plan-page.mjs <plan.md> .agent-lead/checklist.html --title "<Project> plan" [--lede "<one sentence>"] [--sections "<regex>"]
```

- `<skill>` is this skill's folder (the plugin cache path, e.g. `~/.claude/plugins/cache/agent-lead/agent-lead/<version>/skills/agent-lead`).
- Markers: `- [x]` done, `- [~]` in progress, `- [ ]` not started; indented lines continue an item; inline
  `[x] a. …` markers are the item's parts and show as a list with their own status.
- Milestones are `##` sections that hold items, or `###` headings named like `M1. …`, `Phase 2 — …`, `Milestone 3:`.
  `###` headings (or a short plain line right before items) group items inside one. `--sections` keeps only the
  `##` sections whose title matches, for plans that mix milestones with other chapters.
- The title defaults to the plan's `#` heading and the lede to its first paragraph; give both when those read like
  internal notes.
- It prints `{ out, sections, done, partial, todo, percent, next }`: use those numbers in your report to the user.
- `checklist.html` is a build output: keep it out of git (`.git/info/exclude`), or commit it if the project's own
  tooling expects it in the repo.
- A project with its own page script keeps it; prefer pointing that script at `plan-page.mjs` (copy it into the
  project and call it from a small wrapper), so every project gets the same page and the same fixes.

## 3. Publish and keep it current

- **First publish:** Artifact tool, `file_path` the built page, `icon: "checklist"`, a one-sentence `description`
  ("<Project>'s implementation checklist: progress, the next item, one card per milestone."). Put the returned URL
  in LEAD.md section 2 and tell the user it is private until they share it.
- **After every checklist change** (an item or part ticked, a split into parts, a new item, a reorder): rebuild and
  republish to the same URL, in the same turn as the commit that changed the plan. `ship` step 7 in SKILL.md.
- **Another session or another device published in between** and the publish is refused: the page is generated, so
  read the live version once (Artifact `read`), check that the plan file is the newer source, and publish your
  rebuilt page again. Never hand-edit the published HTML; change the plan and rebuild.
- **In the report to the user:** the items that changed, the new totals (`done / in progress / not started`), the
  next item, and the link.
- **Local file mode:** rebuild the same way and give the path; offer `open .agent-lead/checklist.html` (macOS) or
  the platform's equivalent.

## 4. What the page must stay

Generated, never edited by hand. One source of truth: the plan file. No secrets, internal URLs with tokens, or
personal data in the plan text it shows, because a shared link exposes it.
