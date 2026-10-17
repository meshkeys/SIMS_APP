import type { KpiDirection } from '../../generated/prisma/enums.js';

export interface KpiPosition {
  direction: KpiDirection;
  baseline: number | null;
  target: number | null;
  actual: number | null;
  rangeLow?: number | null;
  rangeHigh?: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * How far a KPI has travelled from its baseline to its target, as a %.
 *
 *   Non-interest income share: baseline 18%, target 30%, actual 23% → 41.7%
 *   Cost-to-income (lower is better): 68% → 58%, actual 61%         → 70%
 *
 * Works for both directions because the sign of (target − baseline) carries
 * the direction. Not clamped: below 0 means it moved the wrong way, above 100
 * means it beat the target — the UI decides how to draw that.
 * Returns null when it cannot be measured yet.
 */
export function progressToTarget(kpi: KpiPosition): number | null {
  const { baseline, actual } = kpi;
  if (baseline === null || actual === null) return null;

  if (kpi.direction === 'WITHIN_RANGE') {
    const low = kpi.rangeLow ?? null;
    const high = kpi.rangeHigh ?? null;
    if (low === null || high === null) return null;
    if (actual >= low && actual <= high) return 100;
    const bound = actual < low ? low : high;
    if (bound === baseline) return 0;
    return round1(((actual - baseline) / (bound - baseline)) * 100);
  }

  const { target } = kpi;
  if (target === null || target === baseline) return null;
  return round1(((actual - baseline) / (target - baseline)) * 100);
}
