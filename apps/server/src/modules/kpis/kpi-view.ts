import { toIsoDate, toNumber } from '../../common/data/numbers.js';
import { progressToTarget } from '../../domain/strategy/kpi-progress.js';
import type {
  Frequency,
  KpiDirection,
  Trajectory,
} from '../../generated/prisma/enums.js';

type DecimalLike = { toNumber(): number };

/** The shape of a KPI row (with its targets) as read from the database. */
export interface KpiRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  direction: KpiDirection;
  frequency: Frequency;
  baseline: DecimalLike | null;
  baselineDate: Date | null;
  target: DecimalLike | null;
  rangeLow: DecimalLike | null;
  rangeHigh: DecimalLike | null;
  latestValue: DecimalLike | null;
  latestAt: Date | null;
  trajectory: Trajectory;
  targets: {
    id: string;
    label: string;
    targetDate: Date;
    value: DecimalLike;
  }[];
}

export interface KpiTargetView {
  id: string;
  label: string;
  targetDate: string;
  value: number;
}

/** How every screen shows a KPI: position against its current target. */
export interface KpiSummary {
  id: string;
  code: string;
  name: string;
  unit: string;
  direction: KpiDirection;
  frequency: Frequency;
  baseline: number | null;
  baselineDate: string | null;
  /** End-of-plan target. */
  planTarget: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  targets: KpiTargetView[];
  /** The next target due (e.g. FY2026), else the last one. */
  currentTarget: KpiTargetView | null;
  latestValue: number | null;
  latestAt: string | null;
  trajectory: Trajectory;
  /** % of the way from baseline to the current target (see kpi-progress.ts). */
  progressToTarget: number | null;
}

/** Prisma `include` that yields a `KpiRow`. */
export const kpiTargetsInclude = {
  targets: { orderBy: { targetDate: 'asc' } },
} as const;

export function toKpiSummary(kpi: KpiRow, today = new Date()): KpiSummary {
  const targets = kpi.targets.map((target) => ({
    id: target.id,
    label: target.label,
    targetDate: toIsoDate(target.targetDate),
    value: toNumber(target.value),
  }));
  const todayIso = toIsoDate(today);
  const currentTarget =
    targets.find((target) => target.targetDate >= todayIso) ??
    targets.at(-1) ??
    null;
  const baseline = toNumber(kpi.baseline);
  const latestValue = toNumber(kpi.latestValue);
  const rangeLow = toNumber(kpi.rangeLow);
  const rangeHigh = toNumber(kpi.rangeHigh);
  const planTarget = toNumber(kpi.target);

  return {
    id: kpi.id,
    code: kpi.code,
    name: kpi.name,
    unit: kpi.unit,
    direction: kpi.direction,
    frequency: kpi.frequency,
    baseline,
    baselineDate: toIsoDate(kpi.baselineDate),
    planTarget,
    rangeLow,
    rangeHigh,
    targets,
    currentTarget,
    latestValue,
    latestAt: toIsoDate(kpi.latestAt),
    trajectory: kpi.trajectory,
    progressToTarget: progressToTarget({
      direction: kpi.direction,
      baseline,
      target: currentTarget?.value ?? planTarget,
      actual: latestValue,
      rangeLow,
      rangeHigh,
    }),
  };
}
