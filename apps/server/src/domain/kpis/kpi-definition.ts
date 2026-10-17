import type { KpiDirection } from '../../generated/prisma/enums.js';

export interface KpiDefinition {
  direction: KpiDirection;
  baseline: number | null;
  /** End-of-plan target. */
  target: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
}

export interface KpiDefinitionProblem {
  path: 'target' | 'rangeLow' | 'rangeHigh';
  message: string;
}

/**
 * Catches definitions that would make progress meaningless or wrong — the
 * mistakes people actually make when typing KPIs in:
 * - a range KPI without both bounds, or with them reversed;
 * - range bounds on a KPI that is not a range;
 * - a target that equals the baseline (nothing to measure);
 * - a target on the wrong side of the baseline for the direction
 *   (e.g. "higher is better" with a target below the baseline).
 */
export function validateKpiDefinition(
  kpi: KpiDefinition,
): KpiDefinitionProblem[] {
  const problems: KpiDefinitionProblem[] = [];

  if (kpi.direction === 'WITHIN_RANGE') {
    if (kpi.rangeLow === null)
      problems.push({
        path: 'rangeLow',
        message: 'Enter the lowest acceptable value',
      });
    if (kpi.rangeHigh === null)
      problems.push({
        path: 'rangeHigh',
        message: 'Enter the highest acceptable value',
      });
    if (
      kpi.rangeLow !== null &&
      kpi.rangeHigh !== null &&
      kpi.rangeHigh < kpi.rangeLow
    ) {
      problems.push({
        path: 'rangeHigh',
        message: 'The highest value must not be below the lowest',
      });
    }
    return problems;
  }

  if (kpi.rangeLow !== null)
    problems.push({
      path: 'rangeLow',
      message: 'Only "within range" KPIs have a range',
    });
  if (kpi.rangeHigh !== null)
    problems.push({
      path: 'rangeHigh',
      message: 'Only "within range" KPIs have a range',
    });

  if (kpi.baseline !== null && kpi.target !== null) {
    if (kpi.target === kpi.baseline) {
      problems.push({
        path: 'target',
        message: 'The target must differ from the baseline',
      });
    } else if (
      kpi.direction === 'HIGHER_IS_BETTER' &&
      kpi.target < kpi.baseline
    ) {
      problems.push({
        path: 'target',
        message:
          'For "higher is better", the target must be above the baseline',
      });
    } else if (
      kpi.direction === 'LOWER_IS_BETTER' &&
      kpi.target > kpi.baseline
    ) {
      problems.push({
        path: 'target',
        message: 'For "lower is better", the target must be below the baseline',
      });
    }
  }
  return problems;
}

/** Next organisation-wide KPI code: K01, K02… K19 (custom codes are left alone). */
export function nextKpiCode(existingCodes: readonly string[]): string {
  const highest = existingCodes.reduce((max, code) => {
    const match = code.match(/^K(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `K${String(highest + 1).padStart(2, '0')}`;
}
