import type { KpiDirection, Trajectory } from '../../generated/prisma/enums.js';
import type { RulesetConfig } from '../rulesets/ruleset-config.js';
import { progressToTarget } from '../strategy/kpi-progress.js';

export interface KpiForTrajectory {
  direction: KpiDirection;
  baseline: number | null;
  /** End-of-plan target, used when no interim target is due. */
  planTarget: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  /** Interim targets, any order. Dates are YYYY-MM-DD. */
  targets: readonly { targetDate: string; value: number }[];
}

/** A verified reading: the value and the end date of its period (YYYY-MM-DD). */
export interface KpiReading {
  value: number;
  at: string;
}

export interface KpiPositionResult {
  latestValue: number | null;
  latestAt: string | null;
  /** % of the way from baseline to the target due at the reading's date. */
  progress: number | null;
  trajectory: Trajectory;
}

/**
 * Where a KPI stands after its latest verified reading.
 *
 * The reading is measured against the target due next after its own date
 * (FY2025, then FY2026…, else the end-of-plan target), so interim targets
 * phase the expectation over time. The % of the way from baseline to that
 * target is then banded with the organisation's rules:
 *
 *   ≥ onTrajectoryMinPct    → ON_TRAJECTORY      (default 50)
 *   ≥ slightlyBehindMinPct  → SLIGHTLY_BEHIND    (default 40)
 *   below                   → OFF_TRAJECTORY
 *
 * A "within range" KPI is on trajectory inside its range. No reading, no
 * baseline or no target means NOT_MEASURABLE.
 */
export function kpiPosition(
  kpi: KpiForTrajectory,
  readings: readonly KpiReading[],
  impact: RulesetConfig['impact'],
): KpiPositionResult {
  const latest = [...readings].sort((a, b) => b.at.localeCompare(a.at))[0];
  if (!latest) {
    return {
      latestValue: null,
      latestAt: null,
      progress: null,
      trajectory: 'NOT_MEASURABLE',
    };
  }

  const due = [...kpi.targets]
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
    .find((target) => target.targetDate >= latest.at);
  const progress = progressToTarget({
    direction: kpi.direction,
    baseline: kpi.baseline,
    target: due?.value ?? kpi.planTarget,
    actual: latest.value,
    rangeLow: kpi.rangeLow,
    rangeHigh: kpi.rangeHigh,
  });

  return {
    latestValue: latest.value,
    latestAt: latest.at,
    progress,
    trajectory: trajectoryFor(progress, impact),
  };
}

export function trajectoryFor(
  progress: number | null,
  impact: RulesetConfig['impact'],
): Trajectory {
  if (progress === null) return 'NOT_MEASURABLE';
  if (progress >= impact.onTrajectoryMinPct) return 'ON_TRAJECTORY';
  if (progress >= impact.slightlyBehindMinPct) return 'SLIGHTLY_BEHIND';
  return 'OFF_TRAJECTORY';
}
