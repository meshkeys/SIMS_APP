import { z } from 'zod';
import {
  codeSchema,
  elementRefSchema,
  isoDate,
  personRefSchema,
} from './common.js';
import {
  Frequency,
  Health,
  KpiDirection,
  PeriodStatus,
  Trajectory,
} from './enums.js';

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** Fits the Decimal(20,4) columns with room to spare. */
const value = z.number().finite().gte(-1e14).lte(1e14);

export const kpiTargetSchema = z.object({
  /** e.g. "FY2026", "Q3 2026". */
  label: z.string().trim().min(1).max(40),
  targetDate: isoDate,
  value,
});
export type KpiTargetInput = z.output<typeof kpiTargetSchema>;

const kpiFields = {
  /** Organisation-wide code; generated (K01, K02…) when omitted. */
  code: codeSchema,
  name: z.string().trim().min(1).max(200),
  /** "%", "NGN m", "days", "score", "clients"… */
  unit: z.string().trim().min(1).max(30),
  direction: z.enum(KpiDirection),
  frequency: z.enum(Frequency),
  baseline: value.nullable(),
  baselineDate: isoDate.nullable(),
  /** End-of-plan target (interim targets go in `targets`). */
  target: value.nullable(),
  rangeLow: value.nullable(),
  rangeHigh: value.nullable(),
  ownerId: z.uuid().nullable(),
};

export const createKpiSchema = z.object({
  code: kpiFields.code.optional(),
  name: kpiFields.name,
  unit: kpiFields.unit,
  direction: kpiFields.direction.default('HIGHER_IS_BETTER'),
  frequency: kpiFields.frequency.default('MONTHLY'),
  baseline: kpiFields.baseline.default(null),
  baselineDate: kpiFields.baselineDate.default(null),
  target: kpiFields.target.default(null),
  rangeLow: kpiFields.rangeLow.default(null),
  rangeHigh: kpiFields.rangeHigh.default(null),
  ownerId: kpiFields.ownerId.default(null),
  targets: z.array(kpiTargetSchema).max(20).default([]),
});
export type CreateKpiInput = z.output<typeof createKpiSchema>;

export const updateKpiSchema = z
  .object({
    ...kpiFields,
    /** Move to another element (same plan, on a level that allows KPIs). */
    elementId: z.uuid(),
  })
  .partial()
  .refine((kpi) => Object.keys(kpi).length > 0, 'Nothing to update');
export type UpdateKpiInput = z.output<typeof updateKpiSchema>;

export const kpiTargetsSchema = z.object({
  targets: z.array(kpiTargetSchema).max(20),
});
export type KpiTargetsInput = z.output<typeof kpiTargetsSchema>;

export const kpiListQuerySchema = z.object({
  elementId: z.uuid().optional(),
});
export type KpiListQuery = z.output<typeof kpiListQuerySchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const kpiTargetViewSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  targetDate: isoDate,
  value: z.number(),
});
export type KpiTargetView = z.infer<typeof kpiTargetViewSchema>;

export const kpiSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  direction: z.enum(KpiDirection),
  frequency: z.enum(Frequency),
  baseline: z.number().nullable(),
  baselineDate: isoDate.nullable(),
  /** End-of-plan target. */
  planTarget: z.number().nullable(),
  rangeLow: z.number().nullable(),
  rangeHigh: z.number().nullable(),
  targets: z.array(kpiTargetViewSchema),
  /** The next target due (e.g. FY2026), else the last one. */
  currentTarget: kpiTargetViewSchema.nullable(),
  latestValue: z.number().nullable(),
  latestAt: isoDate.nullable(),
  trajectory: z.enum(Trajectory),
  /** % of the way from baseline to the current target; may exceed 0–100. */
  progressToTarget: z.number().nullable(),
});
export type KpiSummary = z.infer<typeof kpiSummarySchema>;

export const kpiListItemSchema = kpiSummarySchema.extend({
  element: elementRefSchema,
  /** The top-level element it rolls up to (e.g. its pillar). */
  topLevel: elementRefSchema,
  owner: personRefSchema.nullable(),
});
export type KpiListItem = z.infer<typeof kpiListItemSchema>;

export const kpiDetailSchema = kpiSummarySchema.extend({
  planId: z.uuid(),
  element: elementRefSchema,
  owner: personRefSchema.nullable(),
  /** Most recent periods, oldest first (up to 12). */
  actuals: z.array(
    z.object({
      period: z.string(),
      periodEnd: isoDate,
      value: z.number(),
      verified: z.boolean(),
      commentary: z.string().nullable(),
    }),
  ),
  /** Initiatives expected to move this KPI. */
  linkedInitiatives: z.array(
    z.object({
      initiativeId: z.uuid(),
      code: z.string(),
      title: z.string(),
      health: z.enum(Health),
      expectedImpact: z.number().nullable(),
    }),
  ),
  /** Sensitive initiatives the caller may not see, counted but not listed. */
  hiddenLinkedInitiatives: z.int().min(0),
});
export type KpiDetail = z.infer<typeof kpiDetailSchema>;

// ---------------------------------------------------------------------------
// KPI actuals: one reporting period's readings
// ---------------------------------------------------------------------------

export const recordKpiActualsSchema = z.object({
  actuals: z
    .array(
      z.object({
        kpiId: z.uuid(),
        value,
        commentary: z.string().trim().max(1000).nullable().default(null),
      }),
    )
    .min(1, 'Enter at least one actual')
    .max(500),
});
export type RecordKpiActualsInput = z.output<typeof recordKpiActualsSchema>;

export const verifyKpiActualsSchema = z.object({
  kpiIds: z.array(z.uuid()).min(1, 'Choose at least one KPI').max(500),
});
export type VerifyKpiActualsInput = z.output<typeof verifyKpiActualsSchema>;

export const kpiActualRowSchema = z.object({
  kpi: z.object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    unit: z.string(),
    direction: z.enum(KpiDirection),
  }),
  topLevel: elementRefSchema,
  owner: personRefSchema.nullable(),
  baseline: z.number().nullable(),
  /** The target due at the end of this period (e.g. FY2026), else the plan target. */
  target: z.number().nullable(),
  targetLabel: z.string().nullable(),
  /** The last verified reading before this period. */
  previous: z.object({ period: z.string(), value: z.number() }).nullable(),
  /** This period's reading, if one was recorded. */
  actual: z
    .object({
      value: z.number(),
      commentary: z.string().nullable(),
      verified: z.boolean(),
      recordedBy: personRefSchema.nullable(),
      verifiedBy: personRefSchema.nullable(),
    })
    .nullable(),
  can: z.object({ record: z.boolean(), verify: z.boolean() }),
});
export type KpiActualRow = z.infer<typeof kpiActualRowSchema>;

/**
 * Every KPI of the period's plan with this period's reading. KPI owners
 * record their own; the Strategy Office records any KPI and verifies.
 */
export const kpiActualsSheetSchema = z.object({
  period: z.object({
    id: z.uuid(),
    name: z.string(),
    endDate: isoDate,
    status: z.enum(PeriodStatus),
  }),
  rows: z.array(kpiActualRowSchema),
  counts: z.object({
    kpis: z.int().min(0),
    recorded: z.int().min(0),
    verified: z.int().min(0),
  }),
  /** False once the period is locked (readings are then part of the record). */
  open: z.boolean(),
});
export type KpiActualsSheet = z.infer<typeof kpiActualsSheetSchema>;
