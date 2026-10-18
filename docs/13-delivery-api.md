# 13. Delivery API

Initiatives: the **Initiative register**, **Initiative detail**, health recalculation and
status overrides. (Creating and editing initiatives, milestones, tasks and dependencies
follows in the next slice.)

## 13.1 Endpoints

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/v1/initiatives` | any member | The register: tabs, health chips, filters, sorting, pages |
| `GET /api/v1/initiatives/:id` | any member who may see it | Everything on the detail screen |
| `PUT /api/v1/initiatives/:id/override` | see 13.5 | Override the calculated status |
| `DELETE /api/v1/initiatives/:id/override` | see 13.5 | Remove an override |
| `POST /api/v1/initiatives/recalculate` | Strategy Office, Admin | Recalculate progress and health now |

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
| Dependencies | `blockedBy` (what it waits on) and `enables` (what waits on it), with status and blocked-since |
| KPIs | the KPIs it is expected to move |
| History | planned vs verified over time (the chart) |
| Activity | the 10 latest audit events for the initiative and its milestones, as sentences ("Status overridden Red → Amber with reason", "Forecast for Vendor contract signed moved 7 Oct → 22 Oct") with who did them |

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
