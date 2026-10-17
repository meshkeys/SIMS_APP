# 12. Strategy API

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
  (`executionScore`, `impactScore`, `health`), `kpiCount`, a `headlineKpi` for the card
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

## 12.7 Not yet

KPI management (create/edit KPIs, interim targets) is the next slice. Plan approval
(maker-checker, versioning approved plans) arrives with the governance slice; until then
changes to an approved plan are allowed for the Strategy Office and fully audited.
