import { z } from 'zod';
import {
  clearableText,
  codeSchema,
  isoDate,
  isoDateTime,
  personRefSchema,
} from './common.js';
import {
  FrameworkTemplate,
  Health,
  InitiativeStatus,
  PlanStatus,
} from './enums.js';
import { kpiSummarySchema } from './kpis.js';

/** Deepest strategy framework an organisation can configure. */
export const MAX_FRAMEWORK_LEVELS = 10;

const text = (max: number) => z.string().trim().min(1).max(max);

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

const planDates = <T extends { startDate?: string; endDate?: string }>(
  plan: T,
) => !plan.startDate || !plan.endDate || plan.endDate >= plan.startDate;
const datesMessage = {
  message: 'The end date must be on or after the start date',
  path: ['endDate'],
};

export const createPlanSchema = z
  .object({
    name: text(120),
    startDate: isoDate,
    endDate: isoDate,
    template: z.enum(FrameworkTemplate).default('STRATEGIC_PILLARS'),
    vision: clearableText(1000).optional(),
    mission: clearableText(1000).optional(),
    values: z.array(text(80)).max(20).optional(),
    aspiration: clearableText(1000).optional(),
  })
  .refine(planDates, datesMessage);
export type CreatePlanInput = z.output<typeof createPlanSchema>;

export const updatePlanSchema = z
  .object({
    name: text(120),
    startDate: isoDate,
    endDate: isoDate,
    vision: clearableText(1000),
    mission: clearableText(1000),
    values: z.array(text(80)).max(20),
    aspiration: clearableText(1000),
  })
  .partial()
  .refine((plan) => Object.keys(plan).length > 0, 'Nothing to update')
  .refine(planDates, datesMessage);
export type UpdatePlanInput = z.output<typeof updatePlanSchema>;

export const levelsSchema = z.object({
  levels: z
    .array(
      z.object({
        id: z.uuid().optional(),
        label: text(60),
        pluralLabel: text(60),
        codePrefix: z
          .string()
          .trim()
          .toUpperCase()
          .regex(
            /^[A-Z][A-Z0-9]{0,4}$/,
            'Use 1–5 letters or digits, starting with a letter',
          ),
        allowsKpis: z.boolean(),
      }),
    )
    .min(1, 'Keep at least one level')
    .max(MAX_FRAMEWORK_LEVELS, `Use at most ${MAX_FRAMEWORK_LEVELS} levels`),
});
export type LevelsInput = z.output<typeof levelsSchema>;

export const createElementSchema = z.object({
  /** Omit for a top-level element (e.g. a pillar). */
  parentId: z.uuid().optional(),
  title: text(200),
  description: clearableText(2000).optional(),
  /** Generated from the tree (P6, O6.1…) when omitted. */
  code: codeSchema.optional(),
  ownerId: z.uuid().nullable().optional(),
  sponsorId: z.uuid().nullable().optional(),
});
export type CreateElementInput = z.output<typeof createElementSchema>;

export const updateElementSchema = z
  .object({
    title: text(200),
    description: clearableText(2000),
    code: codeSchema,
    ownerId: z.uuid().nullable(),
    sponsorId: z.uuid().nullable(),
    /** Move under another element one level up (same plan). */
    parentId: z.uuid(),
    /** Position among siblings (0 = first). */
    sortOrder: z.int().min(0).max(10_000),
  })
  .partial()
  .refine((element) => Object.keys(element).length > 0, 'Nothing to update');
export type UpdateElementInput = z.output<typeof updateElementSchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const planSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(PlanStatus),
  version: z.int(),
  template: z.enum(FrameworkTemplate),
  startDate: isoDate,
  endDate: isoDate,
  approvedAt: isoDateTime.nullable(),
  /** The plan screens open by default. */
  isCurrent: z.boolean(),
});
export type PlanSummary = z.infer<typeof planSummarySchema>;

export const levelViewSchema = z.object({
  id: z.uuid(),
  depth: z.int().min(0),
  label: z.string(),
  pluralLabel: z.string(),
  codePrefix: z.string().nullable(),
  allowsKpis: z.boolean(),
});
export type LevelView = z.infer<typeof levelViewSchema>;

export const healthCountsSchema = z.object({
  GREEN: z.int().min(0),
  AMBER: z.int().min(0),
  RED: z.int().min(0),
  UNKNOWN: z.int().min(0),
});
export type HealthCounts = z.infer<typeof healthCountsSchema>;

/** 0–100, null until there is something to measure. */
const score = z.number().nullable();

export const mapElementSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  levelId: z.uuid(),
  depth: z.int().min(0),
  code: z.string(),
  title: z.string(),
  sortOrder: z.int(),
  owner: personRefSchema.nullable(),
  sponsor: personRefSchema.nullable(),
  /** Calculated from initiatives (delivered ÷ planned). */
  executionScore: score,
  /** Calculated from KPIs (average % to target). */
  impactScore: score,
  health: z.enum(Health),
  kpiCount: z.int().min(0),
  /** First KPI, shown on the card: "Non-interest income: 18% → 30%". */
  headlineKpi: z
    .object({
      name: z.string(),
      unit: z.string(),
      baseline: z.number().nullable(),
      target: z.number().nullable(),
    })
    .nullable(),
  /** Active initiatives linked to this element, by effective health. */
  initiatives: z.object({
    total: z.int().min(0),
    byHealth: healthCountsSchema,
  }),
});
export type MapElement = z.infer<typeof mapElementSchema>;

export const strategyMapSchema = z.object({
  plan: z.object({
    id: z.uuid(),
    name: z.string(),
    status: z.enum(PlanStatus),
    version: z.int(),
    startDate: isoDate,
    endDate: isoDate,
    approvedAt: isoDateTime.nullable(),
    vision: z.string().nullable(),
    mission: z.string().nullable(),
    values: z.array(z.string()),
    aspiration: z.string().nullable(),
  }),
  levels: z.array(levelViewSchema.extend({ elementCount: z.int().min(0) })),
  totals: z.object({
    kpis: z.int().min(0),
    activeInitiatives: z.int().min(0),
  }),
  /** Flat list ordered for display (depth, then sort order); build the tree with parentId. */
  elements: z.array(mapElementSchema),
});
export type StrategyMap = z.infer<typeof strategyMapSchema>;

export const elementContributorSchema = z.object({
  initiativeId: z.uuid(),
  code: z.string(),
  title: z.string(),
  status: z.enum(InitiativeStatus),
  health: z.enum(Health),
  verifiedProgress: z.number(),
  contributionWeight: z.number(),
  /** This element is the initiative's home objective. */
  isPrimary: z.boolean(),
});
export type ElementContributor = z.infer<typeof elementContributorSchema>;

export const elementDetailSchema = z.object({
  id: z.uuid(),
  planId: z.uuid(),
  code: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  depth: z.int().min(0),
  level: z.object({ id: z.uuid(), label: z.string() }),
  /** Ancestors from the top, e.g. [P1 Revenue Diversification]. */
  breadcrumb: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      title: z.string(),
      levelLabel: z.string(),
    }),
  ),
  owner: personRefSchema.nullable(),
  sponsor: personRefSchema.nullable(),
  executionScore: score,
  impactScore: score,
  health: z.enum(Health),
  kpis: z.array(kpiSummarySchema),
  contributors: z.array(elementContributorSchema),
  /** Sensitive initiatives the caller may not see, counted but not listed. */
  hiddenContributors: z.int().min(0),
  children: z.array(
    z.object({ id: z.uuid(), code: z.string(), title: z.string() }),
  ),
});
export type ElementDetail = z.infer<typeof elementDetailSchema>;

/** Starting frameworks offered on the "How is your strategy structured?" step. */
export const frameworkTemplateViewSchema = z.object({
  key: z.enum(FrameworkTemplate),
  name: z.string(),
  description: z.string(),
  levels: z.array(
    z.object({
      label: z.string(),
      pluralLabel: z.string(),
      codePrefix: z.string(),
      allowsKpis: z.boolean(),
    }),
  ),
  starterElements: z.array(z.string()),
});
export type FrameworkTemplateView = z.infer<typeof frameworkTemplateViewSchema>;
