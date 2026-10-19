import type { BenefitQuarter } from '@sims/contracts';

/** A drop of this many points in capture rate counts as "falling behind". */
const FALLING_BEHIND_PP = 10;

/**
 * The sentence under the benefits chart, from the quarters that have ended:
 * "Realisation is falling behind from Q3: 57% of expected value captured
 * against 87% in Q1." Null before any quarter has ended.
 */
export function benefitInsight(quarters: BenefitQuarter[]): string | null {
  const done = quarters.filter(
    (q): q is BenefitQuarter & { captureRate: number } =>
      q.complete && q.captureRate !== null,
  );
  const first = done[0];
  const last = done.at(-1);
  if (!first || !last) return null;

  const from = done.find(
    (q) => first.captureRate - q.captureRate >= FALLING_BEHIND_PP,
  );
  if (from && first.captureRate - last.captureRate >= FALLING_BEHIND_PP) {
    return `Realisation is falling behind from ${from.label}: ${last.captureRate}% of expected value captured against ${first.captureRate}% in ${first.label}.`;
  }
  if (last.captureRate >= 100) {
    return `Realisation is on or ahead of expectation: ${last.captureRate}% of expected value captured in ${last.label}.`;
  }
  return `${last.captureRate}% of expected value captured in ${last.label}.`;
}

/**
 * A "nice" axis for values up to `max`: about four steps of 1, 2, 2.5 or 5
 * times a power of ten. 1,500 → 0, 500, 1,000, 1,500.
 */
export function niceTicks(max: number, steps = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / steps;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ??
    10 * power;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}
