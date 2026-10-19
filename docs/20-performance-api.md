# 20. Performance and KPI actuals API

The strategic impact lens: *completion is not success*. These endpoints record what each KPI
actually measured every reporting period, judge whether it is on trajectory, and show whether
delivered work is creating the value it promised (wireframe page 6, "KPIs & benefits
realisation").

## 20.1 Endpoints

| Method & path | Who | Purpose |
|---|---|---|
| `GET /api/v1/periods/:periodId/kpi-actuals` | any member | The period's KPI sheet: every KPI with this period's reading |
| `PUT /api/v1/periods/:periodId/kpi-actuals` | KPI owners (their own), Strategy Office (any) | Record readings |
| `POST /api/v1/periods/:periodId/kpi-actuals/verify` | Strategy Office, System Admin | Verify readings owners recorded |
| `GET /api/v1/performance?year=` | any member | Benefits by quarter, trajectory counts, scorecard, low-value work |

## 20.2 Recording KPI actuals

One reading per KPI per reporting period (the month in a monthly cycle).

- **KPI owners** record readings for the KPIs they own. Their readings are **unverified**
  until the Strategy Office verifies them, and they can correct them until then. Recording
  someone else's KPI is `403 NOT_KPI_OWNER`; changing a verified reading is
  `409 KPI_ACTUAL_VERIFIED` ("ask the Strategy Office to correct it").
- **The Strategy Office** records any KPI. Their readings are verified as they are saved, and
  they may correct a verified reading (it stays verified, under their name).
- **Verifying** takes a list of KPIs. Readings already verified are left as they are; a KPI
  with no reading this period is `409 KPI_ACTUAL_MISSING`.
- A **locked** period's readings are part of the record: writes are `409 PERIOD_LOCKED`.
- Readings are validated field by field: each KPI once per request, and only KPIs of the
  period's plan (`400 VALIDATION_FAILED`, paths like `actuals.2.kpiId`).

The sheet lists every KPI of the plan, in code order, with its pillar, owner, baseline, the
target due at the end of the period (with its label, e.g. FY2026), the **previous verified
reading**, this period's reading (who recorded and verified it) and `can.record` /
`can.verify` for the caller, plus counts of KPIs, readings recorded and readings verified.

**Only verified readings count.** When a reading is verified (or saved by the Strategy
Office), the KPI's latest value, its date (the period's end) and its trajectory are
recalculated, and then every pillar's and objective's impact score (chapter 16). Audit
events: `KPI_ACTUALS_RECORDED`, `KPI_ACTUALS_VERIFIED`, on the reporting period.

## 20.3 Trajectory

A KPI's trajectory compares its latest verified reading with the **target due next after
the reading's date** — FY2025 for a 2025 reading, FY2026 for a 2026 one, else the end-of-plan
target. Interim targets therefore phase the expectation over the plan. The reading's
progress from baseline to that target (chapter 12, `progressToTarget`) is banded with the
organisation's rules (chapter 7):

| Progress to the target due | Trajectory |
|---|---|
| ≥ `impact.onTrajectoryMinPct` (default 50%) | On trajectory |
| ≥ `impact.slightlyBehindMinPct` (default 40%) | Slightly behind |
| below | Off trajectory |
| no reading, baseline or target | Not measurable |

A "within range" KPI inside its range is on trajectory. Example: non-interest income share,
baseline 18%, FY2026 target 30%, September reading 23% → 41.7% of the way → slightly behind.

## 20.4 Performance overview

`GET /performance` returns the whole page in one call, for one **calendar year** (`year`,
default the current year, clamped to the plan; a year outside the plan is a
`400` on `year`). The years of the plan are listed for the period picker.

| Field | What it holds |
|---|---|
| `benefits.expected` | Financial benefits expected in the year, from approved business cases (initiatives approved, active, on hold or closed) |
| `benefits.expectedToDate` | Expected in quarters that have ended — the "YTD expectation" |
| `benefits.realisedToDate`, `realisedPctOfExpected` | Verified realised benefits in the year, and as a % of the YTD expectation |
| `benefits.quarters` | Q1–Q4: expected, realised (null until something is realised in a quarter still running), re-forecast, complete, capture rate (realised ÷ expected) |
| `kpis` | Counts by trajectory: on, slightly behind, off, not measurable |
| `lowValue` | "Delivered, but not creating value": closed initiatives, or active ones that are Green, whose impact is below `impact.lowValueThresholdPct`; lowest impact first (10 shown, exact count) |
| `scorecard` | Every KPI: pillar, baseline, the year's target, latest reading, trajectory and up to six verified readings (oldest first) for the trend line |
| `can.recordKpiActuals` | True for the Strategy Office and anyone who owns a KPI |
| `currency` | The organisation's currency, for the money figures |

Amounts are whole currency units (the web app formats them, e.g. "₦4.2bn"). Benefits and
initiatives follow the viewer's visibility: sensitive initiatives count only for those who
may see them. Active initiatives in `lowValue` use the same rule as the dashboard's
delivery-vs-value matrix (`ON_PLAN_VALUE_LOW`), so the two screens agree.

## 20.5 Not yet

- **Managing benefits** — adding benefits to an initiative, their expected profile and
  re-forecasts, recording and verifying realised value, and "Request benefits review" —
  is slice 9b. The demo data provides benefits until then.
- **Initiative impact** (`impactScore`, `impactSummary`) is still assessed rather than
  calculated from linked KPIs and benefits.
- **Financial years** are calendar years; organisations with another year end come with
  the Administration settings.
