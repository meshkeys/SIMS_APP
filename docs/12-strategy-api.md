# 12. Strategy and KPI API

Plans, their configurable framework levels, and the strategy tree (pillars, objectives, or
whatever the organisation calls its levels). Powers the **Strategy map** screen and
**onboarding step 2** ("How is your strategy structured?").

## 12.1 Endpoints

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/v1/plans` | any member | Plans, newest first; `isCurrent` marks the one screens open by default |
| `GET /api/v1/plans/current/map` | any member | Strategy map of the current plan |
| `GET /api/v1/plans/:id/map` | any member | Strategy map of a given plan |
| `POST /api/v1/plans` | Strategy Office, Admin | Create a draft plan from a framework template |
| `PATCH /api/v1/plans/:id` | Strategy Office, Admin | Edit name, dates, vision, mission, values, aspiration |
| `GET /api/v1/plans/:id/levels` | any member | The plan's levels in order |
| `PUT /api/v1/plans/:id/levels` | Strategy Office, Admin | Save the whole ordered list: rename, add, remove, reorder |
| `POST /api/v1/plans/:id/elements` | Strategy Office, Admin | Add an element (its level follows from its parent) |
| `GET /api/v1/elements/:id` | any member | Element detail: KPIs with progress to target, contributing initiatives, sub-items |
| `PATCH /api/v1/elements/:id` | Strategy Office, Admin | Edit, reassign owner/sponsor, change code, reorder, move to another parent |
| `DELETE /api/v1/elements/:id` | Strategy Office, Admin | Delete an empty element |
| `GET /api/v1/framework-templates` | any member | Starting frameworks for onboarding |

## 12.2 The strategy map (read model)

One call returns everything the screen draws, with a fixed number of database queries
regardless of plan size:

- `plan` — name, status, version, dates, vision, mission, values, aspiration;
- `levels` — each with `elementCount` (the "5 Pillars · 10 Objectives" header);
- `totals` — KPIs and active initiatives;
- `elements` — a **flat list** ordered by depth then position, each with `parentId` (the
  client builds the tree), owner and sponsor (`name`, `jobTitle`), stored rollups
  (`executionScore`, `impactScore`, `health` — calculated, chapter 16.3), `kpiCount`, a `headlineKpi` for the card
  ("Non-interest income: 18% → 30%") and `initiatives` (`total` and `byHealth`).

Rollups are read from stored columns maintained by background recalculation (delivery
slice), never computed per request.

## 12.3 Element detail

- `breadcrumb` — ancestors from the top.
- `kpis[]` — baseline, `currentTarget` (the next target due, e.g. FY2026, else the plan
  target), `latestValue`, `trajectory`, and `progressToTarget`:
  `(actual − baseline) ÷ (target − baseline) × 100`. The same formula works for
  lower-is-better KPIs; values below 0 mean movement the wrong way, above 100 means the
  target was beaten.
- `contributors[]` — initiatives delivering this element, highest contribution first, with
  effective health (override if set), verified progress, weight and whether this is their
  home objective. Draft, proposed and cancelled initiatives are not listed.
- `hiddenContributors` — sensitive initiatives the caller may not see: counted, not listed.

**Sensitive initiatives** are visible to the Strategy Office, CEO, System Admins, Internal
Audit, and the initiative's owner, sponsor and benefits owner. Everyone else, including
the Board, sees them only inside totals.

## 12.4 Framework templates

| Template | Levels | Created with the plan |
|---|---|---|
| Strategic pillars | Strategic pillar (P) → Strategic objective (O, KPIs) | — |
| Balanced Scorecard | Perspective (P) → Strategic objective (O, KPIs) | Financial, Customer, Internal process, Learning and growth |
| OKRs | Objective (O, KPIs) | — |
| Public sector results | National goal (G) → Sector outcome (SO, KPIs) → Programme (PR, KPIs) | — |
| Start from scratch | Goal (G, KPIs) | — |

Everything is editable afterwards.

## 12.5 Changing levels safely

`PUT /plans/:id/levels` takes the complete ordered list (existing levels keep their `id`;
new ones have none). The rules protect the tree:

| Change | Allowed? |
|---|---|
| Rename, change plural or code prefix | Always |
| Add a level below the deepest level that holds items | Yes |
| Remove, move or insert above a level that **holds items** | No — `409 LEVEL_IN_USE` |
| Turn off KPIs on a level that **has KPIs** | No — `409 LEVEL_IN_USE` |
| Anything on empty levels | Yes (ids are kept when they move) |
| Duplicate names or prefixes | No — `400 VALIDATION_FAILED` |

Limits: 1–10 levels.

## 12.6 Elements

- **Codes** follow the tree and are generated when omitted: `P1…P6`; `O6.1` under `P6`;
  `KR1.2.3` under `O1.2`. A custom code may be given; codes are unique per plan
  (`409 CODE_TAKEN`).
- **Moving** (`parentId`) is allowed only to a parent exactly one level up in the same plan.
  Codes are stable identifiers and do not change on a move.
- **Deleting** is refused while the element has sub-items, KPIs or linked initiatives
  (`409 ELEMENT_IN_USE`) — strategy data is never removed by a silent cascade.
- **Owner and sponsor** must be active members of the organisation (see 4.9).
- Every change is recorded in the audit trail (`PLAN_CREATED`, `PLAN_UPDATED`,
  `LEVELS_CHANGED`, `ELEMENT_CREATED`, `ELEMENT_UPDATED`, `ELEMENT_DELETED`) with
  before/after values.

## 12.7 KPIs

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/v1/plans/:planId/kpis` | any member | A plan's KPIs with progress and the top-level element each rolls up to; `?elementId=` narrows to one element |
| `GET /api/v1/kpis/:id` | any member | Definition, targets, last 12 actuals, initiatives expected to move it |
| `POST /api/v1/elements/:elementId/kpis` | Strategy Office, Admin | Create a KPI on an element (with optional interim targets) |
| `PATCH /api/v1/kpis/:id` | Strategy Office, Admin | Edit the definition, owner, or move to another element |
| `PUT /api/v1/kpis/:id/targets` | Strategy Office, Admin | Replace the full list of interim targets |
| `DELETE /api/v1/kpis/:id` | Strategy Office, Admin | Delete a KPI that has no history |

**Definition**

| Field | Notes |
|---|---|
| `code` | Organisation-wide, generated `K01, K02…` when omitted; unique (`409 CODE_TAKEN`) |
| `unit` | Free text: `%`, `NGN m`, `days`, `score`, `clients`… |
| `direction` | `HIGHER_IS_BETTER` (default), `LOWER_IS_BETTER`, or `WITHIN_RANGE` (with `rangeLow`/`rangeHigh`) |
| `frequency` | How often actuals are recorded: monthly (default), quarterly, half-yearly, annually |
| `baseline`, `baselineDate` | Starting point |
| `target` | End-of-plan target |
| `targets[]` | Interim targets (`label`, `targetDate`, `value`), e.g. FY2025, FY2026; returned in date order |

**Rules** (each returns a field-level error)

- A KPI lives on an element whose level allows KPIs (`409 KPIS_NOT_ALLOWED` otherwise —
  e.g. "Strategic pillars do not hold KPIs in this framework").
- The target must differ from the baseline and sit on the right side of it for the
  direction (a "higher is better" target below the baseline is refused).
- Within-range KPIs need both bounds, low ≤ high; other KPIs must not have a range.
  Changing direction away from "within range" clears the range automatically.
- Interim targets fall inside the plan period, with distinct dates and labels.
- Moving a KPI is allowed only to an element in the same plan whose level allows KPIs.
- A KPI with recorded actuals cannot be deleted — its history feeds past reports
  (`409 KPI_HAS_ACTUALS`); one linked to initiatives must be unlinked first (`409 KPI_IN_USE`).

**Reading position against target.** Every KPI response carries `currentTarget` (the next
target due, else the last one), `latestValue`, `trajectory` and `progressToTarget`.
`trajectory` starts as `NOT_MEASURABLE` and is recalculated whenever a reading is verified
(chapter 20).

Audit events: `KPI_CREATED`, `KPI_UPDATED`, `KPI_TARGETS_CHANGED`, `KPI_DELETED`.

## 12.8 Not yet

Recording KPI actuals and trajectory are in chapter 20. Plan
approval (maker-checker, versioning approved plans) arrives with the governance slice;
until then changes to an approved plan are allowed for the Strategy Office and fully
audited.
