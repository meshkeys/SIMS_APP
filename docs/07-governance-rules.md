# 7. Governance rules (rulesets)

Each organisation runs on a **ruleset**: versioned JSON validated by
`apps/server/src/domain/rulesets/ruleset-config.ts`. Changes follow maker-checker (proposed,
approved by the MD/CEO, logged). Only one ruleset is `ACTIVE` per organisation at a time —
enforced by the database.

## 7.1 Contents

| Section | Setting | Default |
|---|---|---|
| `rag` | `greenMaxPpBehind` — up to this many pp behind plan is Green | 5 |
| | `amberMaxPpBehind` — up to this is Amber; beyond is Red | 15 |
| `healthModifiers` | `overdueCriticalMilestoneForcesRed` | on |
| | `openCriticalIssueCapsAtAmber` | on |
| | `blockedDependencyCapsAtAmber` (`minDaysBlocked`, `criticalPathOnly`) | on, 14 days, critical path only |
| | `missedUpdateMakesUnknown` — no stale Green in the Board pack | on |
| `overrides` | `expiryDays` | 30 |
| | `minimumRole` allowed to override | Executive Sponsor |
| `escalation` | `levels` — see 7.2 | 4 levels |
| | `criticalStartsAtLevel` — critical items skip lower levels | 3 |
| `reportingCycle` | `cadence` | Monthly |
| | Stage windows (working days): owner submission / Strategy Office review / sponsor review / report issue | 1–3 / 4–5 / 6–7 / 8 |
| | `reminderDaysBeforeDue` | 2 and 0 |
| `impact` | `lowValueThresholdPct` — below this % of expected impact, delivered work is "not creating value" | 50 |
| | `onTrajectoryMinPct` / `slightlyBehindMinPct` — KPI trajectory bands, in % of the way from baseline to the target due (chapter 20.3) | 50 / 40 |

## 7.2 Escalation ladder

The ladder is fully configurable: **1 to 10 levels**, each with a name, a description, who
decides, and when unresolved items arrive automatically.

| Field | Meaning |
|---|---|
| `level` | Position, numbered 1, 2, 3… without gaps |
| `name` | Shown on the ladder, e.g. "Executive sponsor" |
| `decidedBy` | `INITIATIVE_OWNER`, `INITIATIVE_SPONSOR`, or `ROLE` (e.g. CEO, BOARD) |
| `autoEscalateAfterDays` | Age (days since raised) at which an item moves here; level 1 = 0; `null` = only by explicit decision |

Validation rules: levels contiguous from 1; timings strictly increase; once a level is
manual-only, every level above it is too; `criticalStartsAtLevel` must exist on the ladder.

Default ladder:

| Level | Name | Decided by | Arrives |
|---|---|---|---|
| L1 | Initiative owner | Initiative owner | when raised |
| L2 | Executive sponsor | Initiative sponsor | after 7 days |
| L3 | MD/CEO · EXCO | CEO | after 14 days, or immediately if critical |
| L4 | Board | Board | by EXCO decision only |

Every level change is recorded with the level's **name at that moment** and the ruleset
version, so history stays accurate after the ladder is renamed or resized.

## 7.3 How completion is calculated

Code: `apps/server/src/domain/delivery/progress.ts`.

- **Verified completion** = Σ(milestone weight × verified completion) ÷ Σ weight.
- **Planned completion** on a date = Σ(weight × share of each milestone's planned window
  that has elapsed) ÷ Σ weight. A milestone's window runs from its `baselineStartDate`
  (or the initiative's start) to its `baselineDate`, and is planned to progress evenly.
- Milestones with weight 0 (e.g. "Vendor contract signed") do not count toward completion
  but still matter to the health rules.
- All dates are calendar days (UTC), so a figure is stable for the whole day.

## 7.4 How health is calculated

Code: `apps/server/src/domain/delivery/health.ts` — a pure function of facts and the
organisation's ruleset. It runs identically in requests, background recalculation, the
demo seed and the admin "impact preview".

| Step | Rule | Effect |
|---|---|---|
| 1 | **Progress vs plan** — pp behind = planned − verified | ≤ Green limit → Green; ≤ Amber limit → Amber; beyond → Red. Ahead of plan is Green |
| 2 | **Open critical issue** (if enabled) | Caps at Amber: the best possible status is Amber. Never improves a worse status |
| 2 | **Blocked dependency** for ≥ N days (if enabled; optionally critical-path only) | Caps at Amber |
| 3 | **Overdue critical milestone** (if enabled) — not complete and past its *baseline* date | Forces Red, whatever else is true |
| 4 | **Missed update** (if enabled) — no update in the most recent **locked** period | Unknown, unless Red was forced in step 3 |
| — | **Update overdue** — the open period's submission deadline has passed with no update | Flag only: status unchanged, shown as "Update overdue · N days" |

An update is **owed** for a period only if the initiative was active before that period's
deadline (`activatedAt`) and had started by the period's end (`baselineStart`). A new
initiative is never flagged for a cycle it was not part of.

Every rule that fires adds a reason with a plain-language `detail`, stored on the initiative
(`healthReasons`) for the "Why this status?" panel. Example (DIG-004):

| Rule | Result | Detail |
|---|---|---|
| Progress vs plan | Amber | 9 pp behind plan (Green up to 5 pp, Amber up to 15 pp) |
| Open critical issue | Amber | Open critical issue: "Core banking API not ready for integration testing" |
| Blocked dependency | Amber | Blocked for 14 days by DIG-011 Core Banking API Layer |
| Overdue critical milestone | **Red** | Critical milestone "Vendor contract signed" overdue by 9 days |

**Missing updates: a two-stage rule.** The aim is a true picture without punishing owners
who still have time:

| When | What people see |
|---|---|
| Before the submission deadline | The normal status |
| Deadline passed, no update yet (cycle still open) | The status, plus **"Update overdue · N days"** — the figures are visibly not fresh, and the update is chased (escalation, reminders) |
| Period locked, still no update | **Unknown** — unverifiable figures never reach the Board pack |

A silent initiative cannot look better than it is: planned progress keeps rising every
day while verified progress stands still, so its status drifts towards Amber and Red on
its own. In the demo, CX-004, DIG-007 and REV-005 carry the overdue flag (the register's
"2 Oct · overdue", the dashboard's "Updates outstanding: 3").

**Overrides.** A manual override (reason, author and expiry are mandatory) is shown
instead of the calculated status until it expires; the calculated status and its reasons
remain visible alongside it.

## 7.5 Versioning the rules format

`schemaVersion` identifies the shape of the JSON. When the shape changes, a new version is
added with a migration function; stored rulesets are never reinterpreted.
