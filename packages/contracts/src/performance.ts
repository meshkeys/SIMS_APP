import { z } from 'zod';
import { elementRefSchema, isoDate } from './common.js';
import { Health, InitiativeStatus, KpiDirection, Trajectory } from './enums.js';

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export const performanceQuerySchema = z.object({
  /** Calendar year to report on; defaults to the current year (within the plan). */
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
export type PerformanceQuery = z.output<typeof performanceQuerySchema>;

// ---------------------------------------------------------------------------
// Response: the "KPIs & benefits realisation" page
// ---------------------------------------------------------------------------

export const benefitQuarterSchema = z.object({
  label: z.enum(['Q1', 'Q2', 'Q3', 'Q4']),
  periodEnd: isoDate,
  expected: z.number(),
  /** Null until something is realised in a quarter that has not ended. */
  realised: z.number().nullable(),
  /** Re-forecast for the quarter, when owners gave one. */
  forecast: z.number().nullable(),
  complete: z.boolean(),
  /** Realised ÷ expected, whole %. */
  captureRate: z.number().nullable(),
});
export type BenefitQuarter = z.infer<typeof benefitQuarterSchema>;

export const lowValueItemSchema = z.object({
  initiativeId: z.uuid(),
  code: z.string(),
  title: z.string(),
  status: z.enum(InitiativeStatus),
  health: z.enum(Health),
  /** Verified delivery, % complete. */
  delivery: z.number(),
  impactScore: z.number(),
  /** e.g. "Active users 35% of target". */
  impactSummary: z.string().nullable(),
});
export type LowValueItem = z.infer<typeof lowValueItemSchema>;

export const scorecardRowSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  direction: z.enum(KpiDirection),
  topLevel: elementRefSchema,
  baseline: z.number().nullable(),
  /** The year's target (e.g. FY2026), else the plan target. */
  target: z.number().nullable(),
  targetLabel: z.string().nullable(),
  latestValue: z.number().nullable(),
  latestAt: isoDate.nullable(),
  trajectory: z.enum(Trajectory),
  /** Up to six verified readings, oldest first. */
  trend: z.array(
    z.object({ period: z.string(), periodEnd: isoDate, value: z.number() }),
  ),
});
export type ScorecardRow = z.infer<typeof scorecardRowSchema>;

export const performanceSchema = z.object({
  plan: z.object({ id: z.uuid(), name: z.string() }),
  year: z.int(),
  /** Years the plan covers, for the period picker. */
  years: z.array(z.int()),
  asAt: isoDate,
  /** The organisation's currency (ISO 4217) for financial benefits. */
  currency: z.string(),
  benefits: z.object({
    /** Financial benefits expected in the year (approved business cases). */
    expected: z.number(),
    /** Expected in quarters that have ended. */
    expectedToDate: z.number(),
    realisedToDate: z.number(),
    realisedPctOfExpected: z.number().nullable(),
    quarters: z.array(benefitQuarterSchema),
  }),
  kpis: z.object({
    total: z.int().min(0),
    onTrajectory: z.int().min(0),
    slightlyBehind: z.int().min(0),
    offTrajectory: z.int().min(0),
    notMeasurable: z.int().min(0),
  }),
  /** "Delivered, but not creating value": closed or on plan, impact below the threshold. */
  lowValue: z.object({
    thresholdPct: z.number(),
    count: z.int().min(0),
    /** Lowest impact first (up to 10; `count` is exact). */
    items: z.array(lowValueItemSchema),
  }),
  scorecard: z.array(scorecardRowSchema),
  can: z.object({
    /** Opens the KPI actuals sheet: the Strategy Office, or anyone owning a KPI. */
    recordKpiActuals: z.boolean(),
  }),
});
export type Performance = z.infer<typeof performanceSchema>;
