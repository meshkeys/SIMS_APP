# 10. Roadmap and status

## 10.1 Build approach

Backend first (database, then APIs per domain), then the web app page by page following
the wireframes. Work is delivered in small slices; each slice is reviewed and committed
with its tests and documentation.

## 10.2 Status

| # | Slice | Status |
|---|---|---|
| 1 | Monorepo, Docker infrastructure, data model and first migration | Done |
| 2 | Row-level security, tenant-scoped database client, health check | Done |
| 3 | Configurable rulesets and escalation ladder; tenant cascade delete; demo seed | Done |
| 4a | Authentication: sign-up with organisation, sign-in, refresh rotation, roles, tenant context per request, API conventions | Done |
| — | Documentation set (this document) | Done |
| 4b | Invitations by email; mail module (SMTP) | Done |
| 5 | Strategy API: plans, framework templates and levels, elements, strategy map read model | Done |
| 5b | KPI management: KPIs, interim targets, definition rules | Done |
| 6a | Rules engine: completion, planned progress, health with reasons, overrides (seed now engine-calculated) | Done |
| 6b | Delivery API (read): register, initiative detail, recalculation, overrides | Done |
| 6c | Delivery API (write): propose/edit initiatives, lifecycle, milestones, tasks, dependencies, objective links | Done |
| 7 | Reporting cycle: periods and deadlines, My updates, verification and challenge, sponsor confirmation, lock and snapshots | Done |
| 8a | Governance: risks and issues, decisions, change requests (maker-checker) | Done |
| 8b | Governance: escalations API (ladder with counts, raise, move up/down, resolve, withdraw, automatic moves with history); portfolio dependencies | Done |
| 8c | Rulesets API: impact preview on today's portfolio, proposals with MD/CEO approval through Decisions required, versions, recalculation on approval | Done |
| 9a | KPI actuals (record, verify), trajectory from the rules, performance overview (benefits by quarter, scorecard, delivered-but-low-value) | Done |
| 9b | Benefits management: benefits per initiative, expected profile and re-forecast, realised value and verification, benefits review requests | Planned |
| 10 | Read models: Command Centre dashboard, pillar rollups, delivery-vs-value matrix | Done |
| 11 | Scheduled jobs on the queue (escalation sweep, reminders, removed-file clean-up), notifications, email as jobs | Planned |
| 12a | Documents API: storage (local disk or any S3), evidence upload/download/remove with type and content checks, evidence per period, reviewed on verification | Done |
| 12b | Report pack API: templates and sections, snapshots (frozen at lock), audience rules, preview content, pack requests and versions, issued packs | Done |
| 12c | Pack rendering as background jobs: PDF (headless Chrome), PowerPoint, Excel appendix; job queue (BullMQ on Redis); downloads and regeneration | Done |
| 13a | Shared API contracts package (`@sims/contracts`): every request and response as zod schemas and types | Done |
| 13b | OpenAPI reference generated from the contracts; route and response drift tests | Done |
| 14 | Web app foundation: design system, app shell, sign-in, typed API client | Done |
| 15 | Command Centre dashboard screen | Done |
| 16 | Strategy map screen; dashboard sidebar cycle widget and legend | Done |
| 17 | Initiative register screen | Done |
| 18a | API: people directory (search members by name, role, department), departments list, register export to Excel (same filters and visibility as the register) | Done |
| 18b | Web app: department filter, **Propose initiative** (guided form: details → objectives and weights → people → baseline and budget, with a reusable people picker), **Export to Excel** | Done |
| 19a | Initiative detail: full read view (overview, why this status, milestones, chart, risks, dependencies, activity, change requests), lifecycle moves and health override; `can` in the API | Done |
| 19b | Initiative detail: editing — details, objectives, milestones, tasks (with field-level permissions in `can`) | Done |
| 19c | Initiative detail: dependencies (with an initiative picker), **Request change** for active baselines, withdraw a pending request | Done |
| 20a | Monthly progress update (owner): My updates, milestone claims, commentary, risks, live checklist, save and submit | Done |
| 20b | Update review: Strategy Office queue, verify, challenge, sponsor approval, comments | Done |
| 21 | KPIs & benefits screen (wireframe page 6): headline figures, expected vs realised chart, delivered-but-low-value, scorecard with trends, **Record KPI actuals** | Done |
| 22 | Escalation centre screen (wireframe page 7): ladder, risk heatmap, open escalations, blocked dependencies, decision log; raise, log risk, move and resolve | Done |
| 20c | Evidence on the update form (upload, list, remove) and in the review panel (download); evidence becomes a blocking checklist item | Done |
| 23 | Board pack builder screen (wireframe page 9): templates, snapshot and audience, sections, live preview, narrative, formats, issued packs with downloads | Done |
| 24 | Administration screen, rules (wireframe page 10): RAG & health rules with impact preview, escalation rules, reporting cycles, rule versions, proposals | Done |
| 25a | Administration API: members (roles, details, deactivate/reactivate with last-admin protection), departments (create, rename, nest, delete empty), organisation settings, audit log | Done |
| 25b | Administration screens: users and roles (with invitations), departments, organisation, audit log; sections shown by role | Done |
| 26a | Workspace set-up API (wireframe page 11): progress and resume, one save per step, framework and terminology, starting rules applied directly, finish; custom field definitions | Done |
| 26b | Sign-up and invitation acceptance screens | Done |
| 26c | Workspace set-up wizard screen (wireframe page 11), including the first pillars and objectives; new workspaces open it until set-up is finished | Done |
| 9b | Benefits management and benefits review | Next |
| 11 | Scheduled jobs and notifications | Planned |

## 10.3 Known follow-ups

- The organisation's terminology (what KPIs, initiatives, milestones and tasks are called) is
  saved and editable, but screens still use the standard words. Strategy level names are
  already used on the strategy map.
- Custom field definitions are saved; entering their values on initiative (and other)
  forms comes with those forms.
- Rate-limit counters move to Redis (shared across instances) with the jobs module.
- Email sending moves to a retrying background job (today: sent after commit; failures are reported and resendable).
- Production email provider and sender domain (SPF, DKIM, DMARC).
- A clean-up job purges the stored bytes of removed documents (slice 11).
- Public holidays in the reporting calendar (today: Mon–Fri working days).
- Per-account (not only per-IP) sign-in throttling.
- Password reset, email verification, SSO (OIDC).
- Production object storage provider and bucket (any S3-compatible service; chapter 21.5).
- CI pipeline (lint, tests, build, docs) on every push.
- Web app: the shared vendor bundle is 189 kB gzipped; screens already load on demand.
- Web app: browser end-to-end tests (Playwright) once the first screens are in.
- Prisma's query engine runs some relation loads concurrently inside its own per-query
  transaction, which `pg` reports as deprecated (removed in pg 9). Our code no longer does
  this; recheck on the next Prisma upgrade before moving to pg 9.
