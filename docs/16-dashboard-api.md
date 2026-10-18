# 16. Dashboard API

The **Strategy Execution Command Centre** in one call, plus how pillar and objective scores
are calculated. Each panel reuses the service behind its own screen (the register, the
reporting cycle, decisions), so a number on the dashboard always matches the page it
links to.

## 16.1 Endpoint

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/v1/dashboard` | any member | The whole current plan |
| `GET /api/v1/dashboard?elementId=…` | any member | Narrowed to one pillar or objective (any level) |

An unknown element answers `404 ELEMENT_NOT_FOUND`; a malformed id answers `400`.
Sensitive initiatives the viewer may not see are left out of **every** panel, counts
included (chapter 12.3).

## 16.2 What it returns

| Field | Panel | Notes |
|---|---|---|
| `plan`, `asAt` | Header | Current plan and the moment of calculation |
| `scope` | Breadcrumb | The element narrowed to, or `null` |
| `cycle` | Cycle tracker | Current period (chapter 14) plus `stages`: owner submission, strategy review, sponsor review, report issue — each `DONE`, `CURRENT` or `UPCOMING` with its deadline. `null` between cycles. |
| `tiles` | Headline tiles | `active`, `onTrack`, `atRisk`, `delayed`, `unknown` (effective health), `updatesOutstanding` this cycle |
| `performance` | Pillar performance | Top-level elements — or the scope's children — with stored execution/impact scores and health, and counts of initiatives, at risk and delayed |
| `matrix` | Delivery vs value | Every active initiative in one of five quadrants (below), with exact counts and up to 50 points per quadrant |
| `watchlist` | Initiative watchlist | Top 5 by the register's default order (worst health first, then due date) |
| `decisions` | Decisions required | First 3 open (by due date) and the total |
| `escalations` | Escalations | First 3 open (highest level, then longest at that level), the total, and a count for every level of the organisation's ladder by its own names |
| `milestones` | Milestones · next 14 days | Open milestones due (forecast date, else baseline) in the next 14 days, soonest first, with slip in days; the total and how many are already overdue |

**"Active"** means what the register's Active tab shows: in delivery or on hold. A scoped
dashboard counts initiatives whose home objective is the element or below it, and lists only
decisions and escalations about those initiatives; the unscoped dashboard also lists
organisation-wide items.

### Delivery-vs-value quadrants

| Quadrant | Rule |
|---|---|
| `ON_PLAN_VALUE_OK` | Effective health Green, impact ≥ threshold |
| `ON_PLAN_VALUE_LOW` | Green, impact below threshold |
| `BEHIND_VALUE_OK` | Amber, Red or Unknown, impact ≥ threshold |
| `BEHIND_VALUE_LOW` | Amber, Red or Unknown, impact below threshold |
| `NOT_MEASURABLE` | No impact figure yet |

The threshold is the organisation's `impact.lowValueThresholdPct` (default 50), returned as
`matrix.lowValueThresholdPct`.

## 16.3 Pillar and objective rollups

Every strategy element stores an execution score, an impact score and a health, calculated
from the initiatives and KPIs beneath it (ADR-022):

- **Execution score** = Σ(weight × verified progress) ÷ Σ(weight × planned progress) × 100,
  capped at 100 — "how much of what was planned by today has been delivered". Weights are
  each initiative's contribution weight to the element. 100 when nothing is planned yet;
  empty when no active initiative contributes.
- **Health** = the weighted average percentage points behind plan, banded with the
  organisation's own RAG thresholds (the same bands as initiatives). Unknown when nothing
  contributes.
- **Impact score** = the average % to target of all KPIs at or below the element, each
  clamped to 0–100.

An initiative counts for every element it is linked to **and all of their ancestors**. Only
`ACTIVE` initiatives count towards the scores: paused work has no meaningful plan to be
measured against. Scores are aggregates, so they include sensitive initiatives without
revealing them.

**When they update:** after every health recalculation (milestone verification, updates,
risks, period lock, `POST /initiatives/recalculate`), and whenever an initiative changes
status. The recalculation summary reports `elementsChanged`.
