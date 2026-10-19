import type { Health, InitiativeStatus } from '../../generated/prisma/enums.js';
import { valueQuadrant } from '../strategy/rollup.js';

/** One expected (and possibly re-forecast) amount, by the end date of its bucket. */
export interface ExpectedAmount {
  periodEnd: string;
  expected: number;
  forecast: number | null;
}

/** One verified realised amount, by the end date of the reporting period it was recorded in. */
export interface RealisedAmount {
  periodEnd: string;
  realised: number;
}

export interface BenefitQuarter {
  label: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  periodEnd: string;
  expected: number;
  /** Null until something is realised in a quarter that has not ended. */
  realised: number | null;
  /** Re-forecast for the quarter, when one was given. */
  forecast: number | null;
  /** True once the quarter has ended. */
  complete: boolean;
  /** Realised ÷ expected, as a whole %; null without both. */
  captureRate: number | null;
}

export interface BenefitYear {
  quarters: BenefitQuarter[];
  /** Everything expected in the year. */
  expected: number;
  /** Expected in quarters that have ended ("YTD expectation"). */
  expectedToDate: number;
  realisedToDate: number;
  /** Realised ÷ expected to date, as a whole %; null when nothing was expected yet. */
  realisedPctOfExpected: number | null;
}

const LABELS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
const QUARTER_ENDS = ['03-31', '06-30', '09-30', '12-31'];

const quarterOf = (isoDate: string) =>
  Math.floor((Number(isoDate.slice(5, 7)) - 1) / 3);
const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : null;

/**
 * Expected vs realised benefits for one calendar year, by quarter: the
 * "Expected vs realised benefits" chart and the headline figures above it.
 * Amounts outside the year are ignored. A quarter is complete once `asAt`
 * is on or after its last day.
 */
export function benefitYear(
  year: number,
  expected: readonly ExpectedAmount[],
  realised: readonly RealisedAmount[],
  asAt: string,
): BenefitYear {
  const prefix = `${year}-`;
  const inYear = <T extends { periodEnd: string }>(rows: readonly T[]) =>
    rows.filter((row) => row.periodEnd.startsWith(prefix));

  const quarters = LABELS.map((label, index) => {
    const periodEnd = `${year}-${QUARTER_ENDS[index]}`;
    return {
      label,
      periodEnd,
      expected: 0,
      realised: null as number | null,
      forecast: null as number | null,
      complete: asAt >= periodEnd,
      captureRate: null as number | null,
    };
  });
  for (const row of inYear(expected)) {
    const quarter = quarters[quarterOf(row.periodEnd)];
    quarter.expected += row.expected;
    if (row.forecast !== null)
      quarter.forecast = (quarter.forecast ?? 0) + row.forecast;
  }
  for (const row of inYear(realised)) {
    const quarter = quarters[quarterOf(row.periodEnd)];
    quarter.realised = (quarter.realised ?? 0) + row.realised;
  }
  for (const quarter of quarters) {
    if (quarter.complete) quarter.realised ??= 0;
    quarter.captureRate =
      quarter.realised === null
        ? null
        : pct(quarter.realised, quarter.expected);
  }

  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const expectedToDate = sum(
    quarters.filter((q) => q.complete).map((q) => q.expected),
  );
  const realisedToDate = sum(quarters.map((q) => q.realised ?? 0));
  return {
    quarters,
    expected: sum(quarters.map((q) => q.expected)),
    expectedToDate,
    realisedToDate,
    realisedPctOfExpected: pct(realisedToDate, expectedToDate),
  };
}

/**
 * "Delivered, but not creating value": work that is finished (closed) or on
 * plan (active and Green), whose impact is measured and below the
 * organisation's low-value threshold. Active initiatives use the same rule as
 * the dashboard's delivery-vs-value matrix (ON_PLAN_VALUE_LOW).
 */
export function isDeliveredLowValue(
  initiative: {
    status: InitiativeStatus;
    health: Health;
    impactScore: number | null;
  },
  lowValueThresholdPct: number,
): boolean {
  const { status, health, impactScore } = initiative;
  if (impactScore === null) return false;
  if (status === 'CLOSED') return impactScore < lowValueThresholdPct;
  return (
    status === 'ACTIVE' &&
    valueQuadrant(health, impactScore, lowValueThresholdPct) ===
      'ON_PLAN_VALUE_LOW'
  );
}
