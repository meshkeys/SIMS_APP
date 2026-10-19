# 13. Delivery API

Initiatives, milestones, tasks and dependencies: the **Initiative register**, **Initiative
detail**, proposing and changing initiatives, health recalculation and status overrides.

## 13.1 Endpoints

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/v1/initiatives` | any member | The register: tabs, health chips, filters, sorting, pages |
| `GET /api/v1/initiatives/export` | any member | The register as an Excel workbook (13.2.1) |
| `GET /api/v1/initiatives/:id` | any member who may see it | Everything on the detail screen |
| `PUT /api/v1/initiatives/:id/override` | see 13.5 | Override the calculated status |
| `DELETE /api/v1/initiatives/:id/override` | see 13.5 | Remove an override |
| `POST /api/v1/initiatives/recalculate` | Strategy Office, Admin | Recalculate progress and health now |
| `POST /api/v1/initiatives` | Strategy Office, Admin, sponsors, owners | Propose (or draft) an initiative |
| `PATCH /api/v1/initiatives/:id` | see 13.8 | Edit details |
| `PUT /api/v1/initiatives/:id/objectives` | Strategy Office | Replace the objectives it contributes to |
| `POST /api/v1/initiatives/:id/status` | Strategy Office | Move through the lifecycle |
| `POST /api/v1/initiatives/:id/milestones` | see 13.8 | Add a milestone |
| `PATCH` / `DELETE /api/v1/milestones/:id` | see 13.8 | Change or remove a milestone |
| `POST /api/v1/milestones/:id/tasks` | Office, sponsor, owner | Add a task |
| `PATCH` / `DELETE /api/v1/tasks/:id` | Office, sponsor, owner; assignee (status only) | Change or remove a task |
| `POST /api/v1/initiatives/:id/dependencies` | Office, sponsor, owner | Record what it waits on |
| `PATCH` / `DELETE /api/v1/dependencies/:id` | Office, sponsor, owner | Change or remove a dependency |

Every change returns the updated initiative detail, so a screen redraws in one step, and
re-runs the health rules for that initiative in the same transaction.

## 13.2 Register

Query parameters (all optional):

| Parameter | Values | Default |
|---|---|---|
| `tab` | `active` (active, on hold) · `pipeline` (draft, proposed, approved) · `closed` · `cancelled` | `active` |
| `health` | One or more of `RED,AMBER,GREEN,UNKNOWN` — effective health | all |
| `elementId` | Any strategy element: initiatives whose home element is it or below it (e.g. a pillar) | — |
| `departmentId` | A department | — |
| `q` | Matches code, title, owner name or owner job title (wildcards are literal) | — |
| `sort` | `health` (worst first, then due date) · `due` · `-due` · `code` · `variance` (furthest behind first) | `health` |
| `page`, `pageSize` | page ≥ 1; size 1–100 | 1, 10 |
| `planId` | A plan | current plan |

The response carries `items`, `page`, `pageSize`, `total`, `totalPages`, plus:

- `tabCounts` — for the tabs, under the current filters (health excluded);
- `healthCounts` — for the chips ("Delayed · 4", "At risk · 7", "On track · 21"), within
  the current tab and filters.

Each item: code, title, status, pillar (top-level element of its home objective), owner,
sponsor, department, due date, forecast end, verified and planned progress, variance (pp),
**effective health** (an unexpired override, otherwise calculated) with the calculated
status and an `overridden` flag, impact score/summary/trajectory, last update, and
`updateOverdue` when this period's update is late.

**Sensitive initiatives** are excluded — from rows *and* counts — for people who may not
see them (chapter 12.3), so totals never reveal their existence.

**Pagination** is page-numbered (offset) on purpose: a tenant has hundreds to low
thousands of initiatives, the screen shows "Page 1 of 4" with jumps, and the query is one
indexed statement. Lists that grow without bound (activity, audit) will use cursors.

### 13.2.1 Export to Excel

`GET /initiatives/export` takes the register's parameters except `page` and `pageSize` and
returns `initiative-register-<date>.xlsx` (the organisation's date). It runs the register's
own query page by page, so filters, order and **visibility are exactly the screen's** —
restricted initiatives the caller may not see are never in the file.

- **Register** sheet: one row per initiative — ID, title, pillar, status, owner and role,
  sponsor, department, due, forecast end, verified %, planned %, variance (pp), health
  (colour-coded), overridden, impact, impact score, last update, update overdue,
  restricted. Dates are real dates and percentages real numbers, so the sheet sorts,
  filters and charts; the header row is frozen and has filters.
- **About** sheet: organisation, when and by whom it was exported, the filters in words
  ("Active · Delayed · sorted by code"), the row count, and what the figures mean.
- Up to 10,000 rows (the About sheet says when the limit was reached). Sent with
  `Cache-Control: no-store`.

## 13.3 Detail

| Section | Contents |
|---|---|
| Header | code, title, status, priority, sensitivity, pillar, every element it contributes to (weight, primary) |
| People | owner, executive sponsor, benefits owner (name and job title), department |
| Plan & money | baseline start/end, forecast end, actual end, budget, spent and % spent, last verified update |
| Execution | verified %, planned %, variance (pp) |
| Health | effective and calculated status, the rules engine's reasons, the active override (status, reason, who, when, expiry), the overdue-update flag |
| Impact | score, summary, trajectory |
| Milestones | weight, critical, status, planned window, forecast/actual, claimed and verified completion, **contribution** (pp it adds to completion), **overdue days**, evidence count |
| Risks & issues | open items, most severe first, with owner, due date and current escalation level |
| Dependencies | `blockedBy` (what it waits on) and `enables` (what waits on it): the dependency's own `id` (for `PATCH`/`DELETE /dependencies/:id`), the other initiative, status, blocked-since, critical path, description and need-by date |
| KPIs | the KPIs it is expected to move |
| History | planned vs verified over time (the chart) |
| Activity | the 10 latest audit events for the initiative and its milestones, as sentences ("Status overridden Red → Amber with reason", "Forecast for Vendor contract signed moved 7 Oct → 22 Oct") with who did them |
| `can` | what **the caller** may do now: `changeStatus` (lifecycle moves they may make — Strategy Office only), `override` (set/clear a health override, by the organisation's rule, active initiatives only), `edit` (owner, sponsor or Office), `requestChange` (baseline locked and still open), `editFields` (exactly which detail fields `PATCH` will accept from them now — see 13.8), `changeObjectives` (Office), `planMilestones` (add/remove milestones, weights, baseline dates, critical, evidence — before activation), `manageWork` (tasks, forecasts, milestone titles, dependencies) |

`can` is computed by the server with the same rules that enforce each action, so screens
show exactly the buttons that will work (the organisation's override rule, for one, is
configurable and not knowable by the client). Every write that returns the detail returns
an up-to-date `can`. A unit test checks that every field `PATCH` accepts has a permission rule,
so a new field cannot slip through without one.

A sensitive initiative the caller may not see answers **404**, never 403, so its existence
is not revealed.

## 13.4 Recalculation

`HealthRecalculationService` gathers each initiative's facts in a fixed number of queries —
milestones, open critical issues, blocked dependencies, the last locked period and the open
period's deadline, and which updates are in — runs the rules engine (chapter 7) with the
organisation's active ruleset, and writes only what changed. It returns
`{ checked, changed, healthChanges: [{ code, from, to }] }`.

It runs when the Strategy Office asks, after anything that affects health (from the next
slice on), and — with the jobs module — nightly, because planned progress and overdue
flags move with the calendar.

**Proof of consistency:** recalculating the demo data at the wireframes' moment changes
nothing, because the seed was produced by the same engine.

## 13.5 Overrides

`PUT /initiatives/:id/override` with `{ health, reason, expiresAt? }`:

- **Who:** from the ruleset's `overrides.minimumRole` (default Executive Sponsor). Strategy
  Office, CEO and Board may override any initiative; sponsors and owners only their **own**.
  System Admins and Internal Audit never can.
- **Reason:** at least 10 characters. **Status:** must differ from the calculated one.
- **Expiry:** defaults to the longest allowed (`overrides.expiryDays`, default 30 days);
  an earlier date may be chosen; never later.
- The calculated status and its reasons stay visible next to the override; once it expires,
  the calculated status shows again automatically.
- Audit events: `STATUS_OVERRIDE`, `OVERRIDE_REMOVED`.

## 13.6 Time

Business logic reads the current time from an injectable `Clock`, never `new Date()`.
Production uses the system clock; tests pin it (the e2e suite runs at the wireframes'
moment, 16 Oct 2026 09:00, and moves it forward to test expiry and drift).

## 13.7 Lifecycle

```
DRAFT ──▶ PROPOSED ──▶ APPROVED ──▶ ACTIVE ⇄ ON_HOLD
  ▲          │                        │
  └──────────┘ (returned for rework)  └──▶ CLOSED
any open status ──▶ CANCELLED          (CLOSED and CANCELLED are final)
```

- Only the Strategy Office changes status (`STRATEGY_OFFICE_ONLY`); skipping a step answers
  `409 INVALID_TRANSITION` naming the allowed moves.
- **On hold, closed and cancelled need a reason** (10+ characters).
- **Activation checks readiness** (`409 NOT_READY`, listing every gap): an owner, an
  executive sponsor, baseline start and end dates, a primary objective, and at least one
  weighted milestone.
- The first activation records `activatedAt`; closing records `actualEnd`.
- **Proposing:** sponsors and owners may propose; a proposer outside the Strategy Office
  becomes the owner unless one is named. Codes are suggested from the pillar's name
  (Digital Transformation → `DIG-016`) when not given; codes are unique (`CODE_TAKEN`).

## 13.8 Who may change what

| | Strategy Office / Admin | Sponsor of it | Owner of it | Others |
|---|---|---|---|---|
| Owner, sponsor, sensitivity; objective links; status | ✓ | — | — | — |
| Title, priority, department, benefits owner | ✓ | ✓ | — | — |
| Description, business case, scope, forecast end, spend | ✓ | ✓ | ✓ | — |
| Baseline (dates, budget) and milestone plan (add/remove, weights, baseline dates, critical) | before activation | before activation | before activation | — |
| Milestone titles, forecasts, order; tasks; dependencies | ✓ | ✓ | ✓ | — |
| Task status | ✓ | ✓ | ✓ | the assignee |

- Not accountable → `403 NOT_ACCOUNTABLE`; a field above your level →
  `403 FIELDS_NOT_PERMITTED` listing the fields; a locked baseline →
  `409 BASELINE_LOCKED`. Sensitive initiatives you may not see answer `404`.
- **The baseline locks when delivery starts — for everyone.** After activation it changes
  only through an approved change request (chapter 15.4).
- A milestone with reported or verified progress cannot be removed (`MILESTONE_HAS_PROGRESS`).
- A forecast move is recorded as its own event and appears in the activity trail
  ("Forecast for … moved 7 Oct → 22 Oct").
- Owner, sponsor, benefits owner and assignee must be active members (chapter 4.8).

## 13.9 Dependencies

- "A depends on B" means A waits on B; both must be in the same plan.
- **Loops are refused** (`409 DEPENDENCY_CYCLE`), naming the loop
  ("DIG-011 → DIG-016 → DIG-004 → DIG-011") — such a chain could never resolve.
- Setting status `BLOCKED` starts the blocked-since clock; leaving it clears it. After the
  configured number of days on the critical path, the waiting initiative's health is capped
  at Amber (chapter 7.4).
- A dependency with an open escalation cannot be removed (`DEPENDENCY_ESCALATED`).

