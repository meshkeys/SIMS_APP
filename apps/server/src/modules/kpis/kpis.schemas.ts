import { z } from 'zod';
import { Frequency, KpiDirection } from '../../generated/prisma/enums.js';

/** Fits the Decimal(20,4) columns with room to spare. */
const value = z.number().finite().gte(-1e14).lte(1e14);
const isoDate = z.iso.date('Use a date like 2026-12-31');

export const kpiTargetSchema = z.object({
  /** e.g. "FY2026", "Q3 2026". */
  label: z.string().trim().min(1).max(40),
  targetDate: isoDate,
  value,
});
export type KpiTargetInput = z.output<typeof kpiTargetSchema>;

const kpiFields = {
  /** Organisation-wide code; generated (K01, K02…) when omitted. */
  code: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$/,
      'Use up to 20 letters, digits, dots or hyphens',
    ),
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

export const idSchema = z.uuid();
