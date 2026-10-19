import { toIsoDate, toNumber } from '../../common/data/numbers.js';
import { progressToTarget } from '../../domain/strategy/kpi-progress.js';
import type {
  Frequency,
  KpiDirection,
  Trajectory,
} from '../../generated/prisma/enums.js';
import type { ElementRef, KpiSummary } from '@sims/contracts';

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

/**
 * Finds the top-level element (e.g. the pillar) each element rolls up to,
 * given every element of the plan.
 */
export function topLevelResolver(
  elements: readonly {
    id: string;
    code: string;
    title: string;
    parentId: string | null;
  }[],
): (elementId: string) => ElementRef {
  const byId = new Map(elements.map((element) => [element.id, element]));
  return (elementId) => {
    let node = byId.get(elementId)!;
    while (node.parentId && byId.has(node.parentId))
      node = byId.get(node.parentId)!;
    return { id: node.id, code: node.code, title: node.title };
  };
}
