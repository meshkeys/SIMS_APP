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

## 7.3 Versioning the rules format

`schemaVersion` identifies the shape of the JSON. When the shape changes, a new version is
added with a migration function; stored rulesets are never reinterpreted.
