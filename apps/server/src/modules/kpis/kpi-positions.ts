import { toIsoDate, toNumber } from '../../common/data/numbers.js';
import { kpiPosition } from '../../domain/kpis/trajectory.js';
import type { RulesetConfig } from '../../domain/rulesets/ruleset-config.js';
import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Recalculates and stores each KPI's latest value, its date and its
 * trajectory from its verified readings (see domain/kpis/trajectory.ts).
 * Shared by the API (after readings are verified) and the demo seed, so both
 * always agree. Returns how many KPIs changed.
 */
export async function recalculateKpiPositions(
  tx: Prisma.TransactionClient,
  kpiIds: readonly string[],
  rules: RulesetConfig,
): Promise<number> {
  if (kpiIds.length === 0) return 0;
  const kpis = await tx.kpi.findMany({
    where: { id: { in: [...kpiIds] } },
    include: {
      targets: { select: { targetDate: true, value: true } },
      actuals: {
        where: { verifiedAt: { not: null } },
        select: { value: true, period: { select: { endDate: true } } },
      },
    },
  });

  let changed = 0;
  // Sequential on purpose: a transaction is one connection.
  for (const kpi of kpis) {
    const next = kpiPosition(
      {
        direction: kpi.direction,
        baseline: toNumber(kpi.baseline),
        planTarget: toNumber(kpi.target),
        rangeLow: toNumber(kpi.rangeLow),
        rangeHigh: toNumber(kpi.rangeHigh),
        targets: kpi.targets.map((target) => ({
          targetDate: toIsoDate(target.targetDate),
          value: toNumber(target.value),
        })),
      },
      kpi.actuals.map((actual) => ({
        value: toNumber(actual.value),
        at: toIsoDate(actual.period.endDate),
      })),
      rules.impact,
    );
    if (
      toNumber(kpi.latestValue) === next.latestValue &&
      toIsoDate(kpi.latestAt) === next.latestAt &&
      kpi.trajectory === next.trajectory
    ) {
      continue;
    }
    changed += 1;
    await tx.kpi.update({
      where: { id: kpi.id },
      data: {
        latestValue: next.latestValue,
        latestAt: next.latestAt ? new Date(next.latestAt) : null,
        trajectory: next.trajectory,
      },
    });
  }
  return changed;
}
