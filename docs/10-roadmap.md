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
| 8b | Governance: automatic escalation ladder, rulesets admin with impact preview | Planned |
| 9 | Benefits realisation and KPI actuals | Planned |
| 10 | Read models: Command Centre dashboard, pillar rollups, delivery-vs-value matrix | Done |
| 11 | Background jobs (BullMQ), notifications, email | Planned |
| 12 | Documents & evidence (object storage), report pack generation (PDF/PPTX/XLSX) | Planned |
| 13a | Shared API contracts package (`@sims/contracts`): every request and response as zod schemas and types | Done |
| 13b | OpenAPI reference generated from the contracts; route and response drift tests | Done |
| 14 | Web app foundation: design system, app shell, sign-in, typed API client | Done |
| 15 | Command Centre dashboard screen | Done |
| 16 | Strategy map screen; dashboard sidebar cycle widget and legend | Done |
| 17 | Initiative register screen | Done |
| 18 | Initiative detail screen | Next |
| 15+ | Web app: each screen, with the backend pieces it needs (8b, 9, 11, 12, 13) | Planned |

## 10.3 Known follow-ups

- Rate-limit counters move to Redis (shared across instances) with the jobs module.
- Email sending moves to a retrying background job (today: sent after commit; failures are reported and resendable).
- Production email provider and sender domain (SPF, DKIM, DMARC).
- Evidence becomes a blocking checklist item once uploads exist (documents slice).
- Public holidays in the reporting calendar (today: Mon–Fri working days).
- Per-account (not only per-IP) sign-in throttling.
- Password reset, email verification, SSO (OIDC).
- Object storage choice (S3-compatible; MinIO's Docker image is no longer published).
- CI pipeline (lint, tests, build, docs) on every push.
- API for the web app: people directory (owner/sponsor pickers) and departments list —
  needed for "Propose initiative" and the register's department filter.
- Web app: the shared vendor bundle is 189 kB gzipped; screens already load on demand.
- Web app: browser end-to-end tests (Playwright) once the first screens are in.
- Prisma's query engine runs some relation loads concurrently inside its own per-query
  transaction, which `pg` reports as deprecated (removed in pg 9). Our code no longer does
  this; recheck on the next Prisma upgrade before moving to pg 9.
