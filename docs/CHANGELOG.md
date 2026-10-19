# Changelog

All notable changes, newest first. Dates are when the slice was completed.

## 2026-10-19 — KPIs & benefits screen (slice 21)
- **KPIs & benefits realisation** page: headline figures, expected vs realised benefits by
  quarter with the forecast and a plain-language reading of the trend, delivered work that
  is not creating value, and the strategic KPI scorecard with trend lines. Year picker in
  the URL.
- **Record KPI actuals** sheet: owners enter their own KPIs, the Strategy Office enters any
  and verifies, with checks before saving; locked periods are read-only.

## 2026-10-19 — KPI actuals and performance API (slice 9a)
- **KPI actuals** per reporting period: owners record their own KPIs, the Strategy Office
  records any KPI and verifies; locked periods are frozen.
- **Trajectory** is now calculated: the latest verified reading against the target due
  next, banded by two new, configurable rules (`onTrajectoryMinPct`, `slightlyBehindMinPct`).
  Verifying a reading also refreshes pillar and objective impact scores.
- **Performance overview** (`GET /performance`): expected vs realised benefits by quarter,
  KPI trajectory counts, the strategic KPI scorecard with six-month trends, and delivered
  work that is not creating value.
- Demo KPI trajectories are calculated by the engine (two demo readings adjusted so the
  wireframe's 9 / 5 / 4 split still holds).

## 2026-10-19 — Update reviews (slice 20b)
- **Reviews** screen for the Strategy Office and sponsors: stage tabs with counts, a queue,
  and a review panel with claims beside verified figures, commentary and risks.
- **Verify** with per-milestone verified figures (live verified completion), **Challenge**
  with a required comment, **Confirm and approve** for sponsors, and optional notes.
- A shared **Conversation** panel on every update — owners can now reply to challenges.
- Reviews appears in the menu only for people who review.

## 2026-10-19 — Monthly progress update (slice 20a)
- **My updates** screen: cards for each update owed this cycle; milestone claims with live
  completion, variance and evidence status; commentary; risks with **Add risk or issue**;
  "I need a management decision"; **Save draft** and **Submit for review**; clear states
  for submitted, challenged, verified, approved and locked.
- The "Before you submit" checklist moved into `@sims/contracts`: the web app runs it live
  and the server runs the same code, with the organisation's threshold now included in the
  update form.

## 2026-10-19 — Dependencies and change requests (slice 19c)
- **Dependencies:** add (initiative picker), change status, remove.
- **Request change** for active baselines — dates and milestones, budget or scope — sending
  only what changes, routed to the right approver; confirmation on the Change requests tab.
- **Change requests** shown in plain words (before → after), with **Withdraw** for pending
  requests.
- One accessible `SearchPicker`, used by the people and initiative pickers.
- API: dependency entries include their id, description and need-by date.

## 2026-10-19 — Editing initiatives (slice 19b)
- **Edit details**, showing only the fields the person may change now and sending only what
  changed; people pickers show the current assignee.
- **Relink objectives** (Strategy Office) with the shared objectives editor (also used by
  Propose initiative).
- **Milestones:** add, edit, remove while the plan is open; title and forecast after
  activation.
- **Tasks:** add with assignee and due date, change status in place, remove.
- API: `can` now lists `editFields`, `changeObjectives`, `planMilestones` and `manageWork`;
  the detail includes the business case and scope; a unit test keeps every editable field
  covered by a permission rule.
- Accessibility fix: some action buttons would have been announced as "EditTechnology
  development" (a lost space in hidden text); they now carry explicit labels.

## 2026-10-19 — Initiative detail (slice 19a)
- Initiative page: header chips and facts, notices, execution and impact, **Why this
  status?** with the override, milestones with contribution, planned-vs-actual chart, risks,
  dependencies, activity; tabs for milestones and tasks, risks, dependencies and change
  requests (tab in the URL).
- Lifecycle moves (approve, activate, hold, resume, close, cancel, return for rework) with
  reasons where required and the server's explanation when refused.
- Health override and its removal, with reason and expiry.
- API: the initiative detail now says what the caller may do (`can`), computed with the
  same rules that enforce each action.

## 2026-10-19 — Propose initiative, department filter, export (slice 18b)
- **Propose initiative** page: details, strategic fit (objectives with weights and a
  primary), people, baseline and budget; save as draft or submit; server errors shown on
  their fields; confirmation on the register's Pipeline tab.
- Reusable, accessible **people picker** (searches the directory; optional role filter).
- Register: **department** filter, **Export to Excel** of the current view, **Propose
  initiative** button for the roles allowed to propose.
- API client: file downloads with the same sign-in and refresh handling as JSON calls.
- Validation: an empty field now reads "Required" even when its minimum is longer.

## 2026-10-19 — People, departments and register export (slice 18a)
- `GET /members`: people directory for pickers — active members by name, searchable by
  name, email or job title, filterable by role and department, paged.
- `GET /departments`: departments by name with member counts.
- `GET /initiatives/export`: the register as an Excel workbook with the screen's filters,
  order and visibility (restricted initiatives never included); typed cells, frozen header
  and filters, and an About sheet describing the export.
- `API_ROUTES` can describe file downloads (`produces`); the OpenAPI document shows them as
  binary responses.
- Dependencies: `exceljs` added; its outdated `uuid` replaced through an npm override, so
  `npm audit` reports no vulnerabilities.

## 2026-10-19 — Initiative register (slice 17)
- Register screen: tabs with counts, search, pillar filter, health chips, sorting and
  paging — all kept in the URL, so views can be shared and dashboard tiles open it
  pre-filtered; broken filter values fall back to defaults.
- Rows show execution against plan (bar, planned tick, pp variance), health, impact and last
  update with overdue flags; sensitive initiatives are marked "Restricted".
- Fixed before release: pausing after a space in the search box dropped the space.
- Tests: screen-level waits raised to 5 s, as screens load on demand and a full parallel
  run can take over a second to show one.

## 2026-10-19 — Strategy map (slice 16)
- Strategy map screen: plan header, aspiration banner with totals per level, pillar cards
  with execution bars and objective cards (headline KPI, initiatives, health in words), and
  a detail panel with KPIs (baseline, target, actual, progress) and contributing
  initiatives. Uses each organisation's own level names; selection kept in the URL.
- Add an objective (or any element) from the map, for the Strategy Office.
- Dashboard: reporting-cycle widget in the sidebar and the progress-bar legend (the rest of
  wireframe page 2).
- Validation messages in plain English ("Required") on server and web app, from the
  contract.
- Fixed: optional fields left blank (e.g. an element's code) blocked the form.

## 2026-10-19 — Command Centre screen (slice 15)
- The dashboard screen: cycle tracker, headline tiles, pillar performance (execution and
  impact), delivery-vs-value matrix, initiative monitoring, decisions, escalations and
  milestones — all from one API call, with skeleton loading, empty and error states.
- Decide in place: approve, reject (with reason) or defer (with a date) from "Decisions
  required", validated with the contract's rules; only the decision owner sees **Review**.
- "View" narrows the dashboard to one pillar and is kept in the URL.
- Shared formatting (dates as written; deadlines in the organisation's time zone), a modal
  dialog and a select control added to the design system; screens load on demand.
- Accessibility: a bar with nothing measured is no longer announced as a meter without a
  value (caught by the automated axe check).

## 2026-10-18 — Web app foundation (slice 14)
- React app on TanStack Router and TanStack Query, styled with Tailwind v4 design tokens
  taken from the wireframes (all text pairs WCAG AA); Radix primitives for dialogs and menus.
- Design system: Button, Card, Badge and HealthBadge, Field/Input/Textarea, Alert, Meter,
  PageHeader, Skeleton, EmptyState, ErrorState, Spinner.
- App shell: grouped sidebar with "due" badge, mobile drawer, account menu with workspace
  switching and sign-out, skip link.
- Sign-in with the contract's validation; sessions restored from the refresh cookie; access
  token in memory only; one shared refresh, serialised across tabs; safe post-sign-in
  redirects (ADR-025).
- Typed API client and query hooks generated from `API_ROUTES`.
- Tests: sign-in flow, session restore, client refresh behaviour, and axe accessibility
  checks.

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
