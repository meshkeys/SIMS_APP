import { z } from 'zod';
import {
  elementRefSchema,
  initiativeRefSchema,
  isoDate,
  isoDateTime,
  personRefSchema,
} from './common.js';
import { registerItemSchema } from './delivery.js';
import { Health, MilestoneStatus, Role, Severity } from './enums.js';
import { decisionViewSchema } from './governance.js';
import { periodSummarySchema } from './reporting.js';

export const dashboardQuerySchema = z.object({
  /** Narrow the dashboard to one pillar or objective (any level). */
  elementId: z.uuid().optional(),
});
export type DashboardQuery = z.output<typeof dashboardQuerySchema>;

export const CYCLE_STAGES = [
  'OWNER_SUBMISSION',
  'STRATEGY_REVIEW',
  'SPONSOR_REVIEW',
  'REPORT_ISSUE',
] as const;
export type CycleStageKey = (typeof CYCLE_STAGES)[number];

export const cycleStageSchema = z.object({
  key: z.enum(CYCLE_STAGES),
  dueAt: isoDateTime.nullable(),
  state: z.enum(['DONE', 'CURRENT', 'UPCOMING']),
});
export type CycleStage = z.infer<typeof cycleStageSchema>;

/** Delivery-vs-value matrix cells (chapter 16.2 of the technical docs). */
export const VALUE_QUADRANTS = [
  'ON_PLAN_VALUE_OK',
  'ON_PLAN_VALUE_LOW',
  'BEHIND_VALUE_OK',
  'BEHIND_VALUE_LOW',
  'NOT_MEASURABLE',
] as const;
export type ValueQuadrant = (typeof VALUE_QUADRANTS)[number];

const count = z.int().min(0);

export const elementPerformanceSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
  health: z.enum(Health),
  executionScore: z.number().nullable(),
  impactScore: z.number().nullable(),
  /** Active and on-hold initiatives the viewer can see whose home objective sits here. */
  initiatives: count,
  atRisk: count,
  delayed: count,
});
export type ElementPerformance = z.infer<typeof elementPerformanceSchema>;

export const matrixPointSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
  health: z.enum(Health),
  impactScore: z.number().nullable(),
});
export type MatrixPoint = z.infer<typeof matrixPointSchema>;

const matrixCell = z.object({ count, items: z.array(matrixPointSchema) });

export const escalationSummarySchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  title: z.string(),
  severity: z.enum(Severity),
  level: z.int().min(1),
  /** The organisation's own name for the level, e.g. "Executive sponsor". */
  levelName: z.string(),
  /** Days since it reached its current level. */
  daysAtLevel: count,
  /** Days since it was raised. */
  ageDays: count,
  initiative: initiativeRefSchema.nullable(),
  decisionFrom: personRefSchema.nullable(),
  decisionFromRole: z.enum(Role).nullable(),
});
export type EscalationSummary = z.infer<typeof escalationSummarySchema>;

export const milestoneDueSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  initiative: initiativeRefSchema,
  /** Forecast date if there is one, else the baseline date. */
  dueDate: isoDate,
  baselineDate: isoDate,
  /** Forecast minus baseline, in days (positive = slipping). */
  slipDays: z.int(),
  isCritical: z.boolean(),
  status: z.enum(MilestoneStatus),
  verifiedCompletion: z.number(),
});
export type MilestoneDue = z.infer<typeof milestoneDueSchema>;

/** The Strategy Execution Command Centre. */
export const dashboardSchema = z.object({
  plan: z.object({
    id: z.uuid(),
    name: z.string(),
    startDate: isoDate,
    endDate: isoDate,
  }),
  asAt: isoDateTime,
  /** The element the dashboard is narrowed to, or null for the whole plan. */
  scope: elementRefSchema.nullable(),
  cycle: periodSummarySchema
    .extend({ stages: z.array(cycleStageSchema) })
    .nullable(),
  tiles: z.object({
    active: count,
    onTrack: count,
    atRisk: count,
    delayed: count,
    unknown: count,
    /** Updates still owed this cycle (whole organisation); null between cycles. */
    updatesOutstanding: count.nullable(),
  }),
  /** Top-level elements, or the scope's children. */
  performance: z.array(elementPerformanceSchema),
  matrix: z.object({
    lowValueThresholdPct: z.number(),
    /** Exact counts; up to 50 points per quadrant. */
    quadrants: z.object({
      ON_PLAN_VALUE_OK: matrixCell,
      ON_PLAN_VALUE_LOW: matrixCell,
      BEHIND_VALUE_OK: matrixCell,
      BEHIND_VALUE_LOW: matrixCell,
      NOT_MEASURABLE: matrixCell,
    }),
  }),
  watchlist: z.array(registerItemSchema),
  decisions: z.object({ items: z.array(decisionViewSchema), total: count }),
  escalations: z.object({
    items: z.array(escalationSummarySchema),
    total: count,
    /** Every level of the organisation's ladder, with its open count. */
    byLevel: z.array(
      z.object({ level: z.int().min(1), name: z.string(), count }),
    ),
  }),
  milestones: z.object({
    items: z.array(milestoneDueSchema),
    total: count,
    overdue: count,
  }),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
