# Founding a project: from an idea to a solid base

Use this when the project is new (no code, or only a sketch), or when an existing project has no product docs. The
goal: before the first feature is built, the lead and the user agree in writing on what is built, for whom, how,
in what order, and how "done" is checked. Then milestone M0 lays a foundation every later item can build on.

The outcome is **six documents** (the user's standard for every project), plus research notes and a decision log:

| # | File | Answers |
| --- | --- | --- |
| 1 | `01-PRD.md` | What and why: problem, users, goals and non-goals, scope of v1, numbered functional requirements (FR-01…), non-functional requirements (NFR-01…), quality bars, success metrics, release criteria, risks. |
| 2 | `02-TRD.md` | How, technically: constraints, architecture and modules, every subsystem, data and sync, auth, security and privacy, performance budgets, testing strategy, tooling, environments. |
| 3 | `03-UI-UX.md` | How it looks and feels: design principles, visual system (tokens: color, type, spacing, radius, motion), navigation, a screen inventory with every state, empty and error states, voice and copy, accessibility. |
| 4 | `04-app-flow.md` | How the user moves: every flow step by step (launch, sign-in, onboarding, daily use, each feature, errors, settings, deletion), with branches and edge cases. Mermaid diagrams where they help. |
| 5 | `05-backend-schema.md` | What is stored and exchanged: conventions, local models, server tables with types and keys, API endpoints with request and response shapes, file and export formats, retention and deletion. |
| 6 | `06-implementation-plan.md` | In what order: ground rules, repository layout, milestones M0…Mn, each with checkbox items that cite the FR numbers they deliver, owner tasks (things only the user can do: accounts, keys, payments), definition of done, risks to watch. **This file is the checklist.** |

Templates for each are in `templates/docs/`. Put the six files in the project's docs folder: an existing one
(`docs/`, `.ai/docs/`), else `docs/`. Record the folder in LEAD.md.

## Phase 1. Intake: ask what only the user knows

Read what exists first (README, notes, a spec file the user points to, the code). Then ask only what is still open,
in batches of up to four questions (AskUserQuestion; options with a recommended default; free text always allowed).
Most important first. Typical questions, pick what applies:

- **Product**: the idea in one sentence; who it is for; the main job users hire it for; what exists today and why it
  is not enough.
- **Platforms**: web, iOS, Android, desktop (macOS, Windows, Linux), browser extension, CLI, API; online or offline.
- **Scope of v1**: the must-haves; what can wait; anything that must be in the first demo.
- **Constraints**: deadline, budget (free tiers only?), the user's own skills (they will maintain it), languages,
  required services, hosting preference, existing accounts.
- **Data and trust**: accounts or not, personal or health or payment data, regions and laws (GDPR, HIPAA, app
  store rules), age limits, data retention.
- **Money**: free, paid, subscription, ads; price; who pays for servers and AI.
- **Look and feel**: references the user likes (apps, sites, Dribbble or Figma links), brand assets, light and dark,
  density, tone of copy.
- **Integrations**: payments, maps, AI models, analytics, email, health or device APIs, imports and exports.
- **Quality bars**: speed, accessibility level, supported devices, test coverage, uptime.
- **Done means**: what the user will check before calling v1 done.

Write the answers into `research/intake.md` (or the project's notes folder) as you go. Do not guess an answer the
user should give; list it as an open question instead.

## Phase 2. Research (see `research.md` for how)

Cheap, focused, with sources. Typical topics:

- **Competitors and references**: 3–8 products. What they do well, what users complain about (store reviews,
  forums), pricing, the flows worth learning from. Screenshots of the key screens with Playwright.
- **Inspiration for the UI**: reference screens for each main screen type, captured and annotated (layout, density,
  type scale, motion), never copied.
- **Platform rules**: store guidelines, browser or OS limits, legal requirements that change the design.
- **Technology options**: two or three candidates per decision (framework, database, hosting, auth, AI), with
  current versions, licenses, free-tier limits and maintenance health. Check versions and limits on the official
  site: your training data is old.
- **Hard problems**: anything nobody on the team has done before gets a short spike plan (what to test, the pass bar).

Save to `research/<topic>.md` with a source list. Summarise each in five lines for the user.

## Phase 3. Decide

- For each choice, a short decision record in `decisions.md`: the options, the choice, why, what would change it.
- Prefer boring, well-documented, widely used tools the user can maintain; free tiers that do not pause; open
  licenses; one language across the stack when possible; managed services over self-hosting for a small team.
- Decisions that cost money, lock the user in, or affect privacy go to the user as a question with your
  recommendation. Everything else you decide and record.

## Phase 4. Write the six documents

1. Write them in order (PRD first; each later document cites the earlier ones).
2. Number things so they can be traced: FR-xx and NFR-xx in the PRD; screens S-xx in the UI/UX doc; flows F-xx in
   the app flow; tables and endpoints by name; milestones M0…Mn with items that cite FR numbers.
3. Keep each document to what a builder needs. Plain, short sentences. Tables for inventories. No filler.
4. Consistency pass before showing the user:
   - Every FR is delivered by some milestone item, and every milestone item cites at least one FR or NFR (or is
     foundation work in M0).
   - Every screen in the UI/UX doc appears in a flow, and every flow step names a screen.
   - Every piece of data in the PRD and flows has a home in the schema; every endpoint a flow uses exists.
   - The TRD covers every NFR with a technique and a test.
   - Open questions are listed at the end of each document, not hidden in the text.
5. Show the user a short summary of each document and the open questions. Get a yes, or changes, before building.
   Commit the documents ("docs: PRD, TRD, UI/UX, app flow, schema, implementation plan").

## Phase 5. Milestone M0: the foundation

M0 makes the project easy to build right. It is the first item of the implementation plan and goes to the worker
like any other item, except that the lead does the parts workers never do (creating the repository, installing
packages, creating accounts the user approved, adding secrets to the environment). Typical M0 items:

- Repository layout from the TRD; README with how to run it; `.env.example` (never real secrets).
- Package manager, pinned versions, the framework scaffold (lead runs the generator and installs).
- Format, lint, typecheck, unit tests, one end-to-end test with Playwright, and a single fast `check` command that
  runs the quick ones. CI running the same.
- The design tokens from the UI/UX doc as code (CSS variables, a theme file), light and dark if planned, and a
  small component set the screens will reuse.
- The data layer skeleton from the schema (migrations, models), and the API skeleton with one real endpoint.
- Developer tools the later items need: a seed script, a screenshot script (`playwright.md`), fixtures folder.
- `AGENTS.md` and `CLAUDE.md` pointers (project-setup.md) and `.agent-lead/WORKER.md` filled with the real commands.

M0 is done when a new developer (or worker) can clone, run one documented command, see the app, and run `check`
green. From then on, the loop in SKILL.md section 2 takes the milestones in order.
