# Changelog

All notable changes, newest first. Dates are when the slice was completed.

## 2026-10-18 — OpenAPI reference and drift tests (slice 13b)
- `API_ROUTES` in `@sims/contracts` describes all 76 endpoints (access, schemas, status);
  role lists and labels moved into the contract.
- Generated OpenAPI 3.1 document at `/api/openapi.json` and an interactive reference at
  `/api/docs` (Scalar, pinned with SRI under a nonce-based CSP); off in production unless
  `API_DOCS=true` (ADR-024).
- Drift tests: every server route must be in the contract with matching access, status,
  rate limit and schemas; every e2e response is validated against its schema; the document
  is validated against the OpenAPI 3.1 specification.

## 2026-10-18 — API contracts (slice 13a)
- New package `@sims/contracts`: every request and response of the API as zod schemas with
  TypeScript types, shared by the server and the web app (ADR-023).
- The server's request schemas moved into the package; its services now return the
  contract types, so the compiler enforces the API shape.
- Database enums are copied into the contract on `db:generate`, with a test that fails if
  they drift.

## 2026-10-18 — Command Centre dashboard (slice 10)
- `GET /dashboard`: cycle tracker with stages, headline tiles, pillar performance,
  delivery-vs-value matrix, watchlist, decisions, escalations by ladder level and milestones
  due in the next 14 days — for the whole plan or one pillar/objective, respecting
  sensitive-initiative visibility.
- Pillar and objective scores and health are now calculated from initiatives and KPIs and
  kept current after every recalculation and status change (ADR-022). The demo seed uses the
  same code, so its pillar figures are calculated rather than copied from the wireframes.
- Queries inside one transaction now run one at a time (a transaction is one connection).

## 2026-10-18 — Governance (slice 8a)
- Risks and issues: register with the 5×5 heatmap, filters and counts; risks scored from
  likelihood × impact; health re-runs when items change (critical-issue cap).
- Decisions required (due dates, overdue, deferral that reappears) and the decision log;
  "I need a management decision" on an update creates a decision for the sponsor.
- Change requests (maker-checker) for active baselines: routed to the MD/CEO (baseline) or
  sponsor (budget, scope), never approved by the requester, re-validated and applied on
  approval, withdrawable. Active baselines are now locked for everyone, the Strategy Office
  included (ADR-021).

## 2026-10-18 — Reporting cycle (slice 7)
- Periods: open with deadlines in working days at 17:00 in the organisation's time zone
  (daylight saving handled), advance stages, lock with progress and report snapshots;
  cycle tracker with "Day N of M" and counts.
- My updates; the update form with lines, live evaluation (claimed, planned, variance,
  health preview), checklist and comment thread; save draft and submit.
- Strategy Office verification (never above the claim), challenges with reasons, sponsor
  confirmation, review queue; health recalculated at each step.
- Locking turns unreported initiatives Unknown (unless forced Red) and freezes the numbers
  Board packs use.

## 2026-10-18 — Delivery API, write side (slice 6c)
- Propose/draft initiatives (code suggested from the pillar), edit with per-initiative
  permissions, replace objective links, lifecycle with readiness checks and reasons.
- Milestones, tasks (assignee may update status) and dependencies (loop detection,
  blocked-since clock). Every change recalculates health in the same transaction.
- Baseline locked once active (Strategy Office only, recorded as `BASELINE_CHANGED`).
- `activatedAt`: updates are owed only for periods after activation — fixes a new
  initiative being flagged for a cycle it was not part of (found by tests).

## 2026-10-18 — Delivery API, read side (slice 6b)
- Initiative register: tabs and health chips with counts, filters (element subtree,
  department, search on code/title/owner), sorting (worst first by default), pages;
  sensitive initiatives excluded from rows and counts.
- Initiative detail: execution, health with reasons and override, milestones with
  contribution and overdue days, risks, dependencies, KPIs, history, readable activity.
- Health recalculation service (reports what changed); manual trigger for the Strategy Office.
- Overrides with role rules from the ruleset (sponsors only on their own initiatives),
  mandatory reason, capped expiry.
- Injectable clock for all date-dependent logic.
- Fix found by tests: compare stored JSON canonically (jsonb reorders keys).

## 2026-10-18 — Rules engine (slice 6a)
- Verified and planned completion from milestones (planned from each milestone's window).
- Health: progress band, critical-issue and blocked-dependency caps, overdue critical
  milestone forces Red, missed update in the last locked period → Unknown; plain-language
  reasons for "Why this status?"; override expiry.
- Demo seed now calculates planned progress and health with the engine and verifies them
  against the wireframes.
- Missing updates: "Update overdue" flag once the open period's deadline passes;
  Unknown only when the period locks without an update (ADR-016).

## 2026-10-18 — KPI management (slice 5b)
- Create, edit, move and delete KPIs; interim targets saved as a list; organisation-wide
  codes (`K01…`).
- Definition rules: target on the right side of the baseline, complete ranges for
  within-range KPIs, targets inside the plan period, KPIs only on levels that allow them.
- KPIs with recorded actuals are protected from deletion.
- Plan KPI list (grouped by top-level element) and KPI detail with targets, recent actuals
  and linked initiatives; shared KPI view used by every screen.

## 2026-10-18 — Strategy API (slice 5)
- Plans from five framework templates (pillars, Balanced Scorecard, OKRs, public sector,
  custom); edit plan details.
- Levels saved as one ordered list with safety rules (no moving/removing levels that hold
  items; no switching off KPIs in use).
- Elements: create with generated codes, edit, move one level up, reorder, delete when empty.
- Strategy map read model (one call, fixed query count) and element detail with KPI
  progress to target and contributing initiatives; sensitive initiatives hidden but counted.
- Owner/sponsor ids validated against active members of the tenant.
- Shared helpers: audit recording, decimal→number, person references, unique-violation detection.

## 2026-10-18 — Invitations (slice 4b)
- Mail module: `Mailer` port with an SMTP implementation (Mailpit locally); HTML and text
  emails with escaped user input.
- Invite, list, resend and revoke (System Admin / Strategy Office); public lookup and accept.
- One-time hashed tokens (7-day expiry); re-invite replaces; seat limit includes pending
  invitations; only System Admins can grant System Admin; existing users link a workspace
  with their password; acceptance verifies the email.
- `sims_invitation_by_token_hash()` lookup; shared secure-token helper.

## 2026-10-18 — Documentation
- Documentation set in `docs/` with a PDF/HTML build (`npm run docs:build`).

## 2026-10-18 — Authentication (slice 4a)
- Sign-up creating an organisation (trial subscription, founder roles, default ruleset).
- Sign-in, refresh-token rotation with reuse detection, switch workspace, sign-out, `/auth/me`.
- Global guards (rate limit → access token → roles); tenant context per request.
- API conventions: `/api/v1`, Problem Details errors, zod validation, request ids,
  security headers, CORS, rate limits with `Retry-After`.
- `sims_auth_memberships()` sign-in lookup; RefreshToken made user-scoped.
- Demo users can sign in (password `Meridian-demo-2026`).

## 2026-10-17 — Rules, ladder and demo data (slice 3)
- Ruleset configuration schema (RAG, modifiers, overrides, ladder, reporting cycle, impact).
- Configurable escalation ladder (1–10 levels) with named level history.
- Tenant deletion by cascade.
- Meridian demo seed reproducing every wireframe number, with integrity tests.

## 2026-10-17 — Tenant isolation (slice 2)
- Row-level security on every tenant table; append-only audit; ~40 CHECK constraints;
  one active ruleset per organisation.
- Tenant-scoped Prisma client and tenant context; validated environment; `/health`.

## 2026-10-17 — Foundation (slice 1)
- Monorepo (npm workspaces), Docker infrastructure (Postgres, Redis, Mailpit).
- Data model (≈40 tables) with composite tenant keys and UUIDv7 ids; first migration.
