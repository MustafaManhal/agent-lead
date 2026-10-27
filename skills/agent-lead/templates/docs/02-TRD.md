# 02. Technical Requirements Document (TRD)

<!-- How it is built. Every NFR from the PRD gets a technique and a test here. Decisions link to decisions.md. -->

## 1. Constraints
<Platforms and minimum versions, budget and free tiers, team skills, offline needs, licenses.>

## 2. Architecture
<A diagram (mermaid) and one paragraph: clients, server, storage, outside services, how data moves.>

### 2.1 Modules
| Module | Responsibility | Depends on |
| --- | --- | --- |

## 3. Stack
| Layer | Choice and version | Why (decision record) |
| --- | --- | --- |

## 4. Subsystems
<One section per hard part: inputs, outputs, algorithm or library, failure modes, tests.>

### 4.1 <Subsystem>

## 5. Data and sync
<Where each kind of data lives, ownership, sync and conflict rules, migrations.>

## 6. Authentication and authorisation
<Sign-in methods, sessions, roles, what each role can do.>

## 7. Outside services and integrations
| Service | Used for | Limits / cost | Failure behaviour |
| --- | --- | --- | --- |

## 8. Security and privacy
<Secrets handling, encryption, data minimisation, logging rules, threat list.>

## 9. Performance budgets
| What | Budget | How measured |
| --- | --- | --- |

## 10. Error handling, logging and monitoring

## 11. Testing strategy
<Unit, integration, end-to-end (Playwright), visual checks, fixtures, what runs in `check` and in CI.>

## 12. Environments and deployment
<Local, preview, production; config and env vars (names only, never values); how to release.>

## 13. Tooling and conventions
<Package manager, format, lint, typecheck, commit style, branch model, the `check` command.>

## 14. Open questions
