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
| 5 | Strategy API: plans, framework levels, elements, KPIs (Strategy map, onboarding step 2) | Next |
| 6 | Delivery API + rules engine: initiatives, milestones, tasks, dependencies, health calculation | Planned |
| 7 | Reporting cycle: periods, updates workflow, verification, locking, snapshots | Planned |
| 8 | Governance: risks, escalations (automatic ladder), decisions, maker-checker approvals, rulesets admin | Planned |
| 9 | Benefits realisation and KPI actuals | Planned |
| 10 | Read models: Command Centre dashboard, pillar rollups, delivery-vs-value matrix | Planned |
| 11 | Background jobs (BullMQ), notifications, email | Planned |
| 12 | Documents & evidence (object storage), report pack generation (PDF/PPTX/XLSX) | Planned |
| 13 | OpenAPI reference; shared API contracts package | Planned |
| 14+ | Web app: design system and shell, then each screen | Planned |

## 10.3 Known follow-ups

- Rate-limit counters move to Redis (shared across instances) with the jobs module.
- Email sending moves to a retrying background job (today: sent after commit; failures are reported and resendable).
- Production email provider and sender domain (SPF, DKIM, DMARC).
- Per-account (not only per-IP) sign-in throttling.
- Password reset, email verification, SSO (OIDC).
- Object storage choice (S3-compatible; MinIO's Docker image is no longer published).
- CI pipeline (lint, tests, build, docs) on every push.
