import { z } from 'zod';
import {
  clearableText,
  codeSchema,
  commaList,
  elementRefSchema,
  isoDate,
  isoDateTime,
  pageMeta,
  personRefSchema,
} from './common.js';
import {
  DependencyStatus,
  Health,
  InitiativeStatus,
  MilestoneStatus,
  RiskStatus,
  RiskType,
  Severity,
  TaskStatus,
  Trajectory,
} from './enums.js';
import { healthCountsSchema } from './strategy.js';

const HEALTH_VALUES = Object.values(Health) as [Health, ...Health[]];

// ---------------------------------------------------------------------------
// Register (read)
// ---------------------------------------------------------------------------

/** Register tabs, matching the screen: Active · Pipeline · Closed · Cancelled. */
export const REGISTER_TABS = {
  active: ['ACTIVE', 'ON_HOLD'],
  pipeline: ['DRAFT', 'PROPOSED', 'APPROVED'],
  closed: ['CLOSED'],
  cancelled: ['CANCELLED'],
} as const satisfies Record<string, readonly InitiativeStatus[]>;
export type RegisterTab = keyof typeof REGISTER_TABS;

export const registerQuerySchema = z.object({
  tab: z.enum(['active', 'pipeline', 'closed', 'cancelled']).default('active'),
  /** One or more effective health values, e.g. `health=RED,AMBER`. */
  health: commaList(HEALTH_VALUES).optional(),
  /** Any strategy element: initiatives whose home element is it or below it. */
  elementId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
  /** Matches code, title, owner name or owner job title. */
  q: z.string().trim().min(1).max(100).optional(),
  /** health (default: worst first, then due date) · due · -due · code · variance (furthest behind first). */
  sort: z.enum(['health', 'due', '-due', 'code', 'variance']).default('health'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  /** Plan to list; defaults to the current plan. */
  planId: z.uuid().optional(),
});
export type RegisterQuery = z.output<typeof registerQuerySchema>;

/** The register's filters and order, without paging: the export takes everything. */
export const registerExportQuerySchema = registerQuerySchema.omit({
  page: true,
  pageSize: true,
});
export type RegisterExportQuery = z.output<typeof registerExportQuerySchema>;

export const XLSX_MEDIA_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const registerItemSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
  status: z.enum(InitiativeStatus),
  priority: z.int().min(1).max(5),
  isSensitive: z.boolean(),
  /** The top-level element of its home objective (e.g. its pillar). */
  pillar: elementRefSchema.nullable(),
  owner: personRefSchema.nullable(),
  sponsor: personRefSchema.nullable(),
  department: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  dueDate: isoDate.nullable(),
  forecastEnd: isoDate.nullable(),
  verifiedProgress: z.number(),
  plannedProgress: z.number(),
  /** Verified minus planned, in percentage points (negative = behind). */
  variancePp: z.number(),
  /** What to show: an unexpired override, otherwise the calculated status. */
  health: z.enum(Health),
  calculatedHealth: z.enum(Health),
  overridden: z.boolean(),
  impactScore: z.number().nullable(),
  impactSummary: z.string().nullable(),
  trajectory: z.enum(Trajectory),
  lastUpdateAt: isoDateTime.nullable(),
  /** Set when this period's update is past its deadline. */
  updateOverdue: z
    .object({ periodName: z.string(), detail: z.string() })
    .nullable(),
});
export type RegisterItem = z.infer<typeof registerItemSchema>;

export const registerPageSchema = z.object({
  items: z.array(registerItemSchema),
  ...pageMeta,
  totalPages: z.int().min(1),
  /** Counts for the tabs, under the current filters (health excluded). */
  tabCounts: z.object({
    active: z.int().min(0),
    pipeline: z.int().min(0),
    closed: z.int().min(0),
    cancelled: z.int().min(0),
  }),
  /** Counts for the health chips, within the current tab and filters. */
  healthCounts: healthCountsSchema,
});
export type RegisterPage = z.infer<typeof registerPageSchema>;

// ---------------------------------------------------------------------------
// Initiative detail (read)
// ---------------------------------------------------------------------------

export const HEALTH_RULES = [
  'PROGRESS_VS_PLAN',
  'OPEN_CRITICAL_ISSUE',
  'BLOCKED_DEPENDENCY',
  'OVERDUE_CRITICAL_MILESTONE',
  'MISSED_UPDATE',
  'UPDATE_OVERDUE',
] as const;

/** FLAG: shown to people, but does not change the status. */
export const HEALTH_EFFECTS = [
  'BASE',
  'CAP_AMBER',
  'FORCE_RED',
  'UNKNOWN',
  'FLAG',
] as const;

/** One line of the "Why this status?" panel. */
export const healthReasonSchema = z.object({
  rule: z.enum(HEALTH_RULES),
  effect: z.enum(HEALTH_EFFECTS),
  /** The status this rule points to on its own. */
  result: z.enum(Health),
  /** Plain-language explanation. */
  detail: z.string(),
});
export type HealthReason = z.infer<typeof healthReasonSchema>;

export const milestoneViewSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  weight: z.number(),
  isCritical: z.boolean(),
  status: z.enum(MilestoneStatus),
  baselineStartDate: isoDate.nullable(),
  baselineDate: isoDate,
  forecastDate: isoDate.nullable(),
  actualDate: isoDate.nullable(),
  claimedCompletion: z.number(),
  verifiedCompletion: z.number(),
  /** Percentage points this milestone adds to the initiative's completion. */
  contribution: z.number(),
  /** Days past the baseline date while incomplete; 0 otherwise. */
  overdueDays: z.int().min(0),
  evidenceCount: z.int().min(0),
  tasks: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      status: z.enum(TaskStatus),
      assignee: personRefSchema.nullable(),
      dueDate: isoDate.nullable(),
      completedAt: isoDateTime.nullable(),
    }),
  ),
});
export type MilestoneView = z.infer<typeof milestoneViewSchema>;

export const dependencyViewSchema = z.object({
  initiativeId: z.uuid(),
  code: z.string(),
  title: z.string(),
  status: z.enum(DependencyStatus),
  blockedSince: isoDate.nullable(),
  isCriticalPath: z.boolean(),
});
export type DependencyView = z.infer<typeof dependencyViewSchema>;

export const initiativeDetailSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(InitiativeStatus),
  priority: z.int().min(1).max(5),
  isSensitive: z.boolean(),
  plan: z.object({ id: z.uuid(), name: z.string() }),
  /** Every element it contributes to; `isPrimary` marks its home. */
  contributesTo: z.array(
    z.object({
      elementId: z.uuid(),
      code: z.string(),
      title: z.string(),
      weight: z.number(),
      isPrimary: z.boolean(),
    }),
  ),
  pillar: elementRefSchema.nullable(),
  owner: personRefSchema.nullable(),
  sponsor: personRefSchema.nullable(),
  benefitsOwner: personRefSchema.nullable(),
  department: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  baseline: z.object({ start: isoDate.nullable(), end: isoDate.nullable() }),
  forecastEnd: isoDate.nullable(),
  actualEnd: isoDate.nullable(),
  budget: z.object({
    baseline: z.number().nullable(),
    spent: z.number().nullable(),
    spentPct: z.number().nullable(),
  }),
  lastVerifiedUpdateAt: isoDateTime.nullable(),
  execution: z.object({
    verified: z.number(),
    planned: z.number(),
    variancePp: z.number(),
  }),
  health: z.object({
    effective: z.enum(Health),
    calculated: z.enum(Health),
    reasons: z.array(healthReasonSchema),
    override: z
      .object({
        health: z.enum(Health),
        reason: z.string(),
        by: personRefSchema.nullable(),
        at: isoDateTime.nullable(),
        expiresAt: isoDateTime,
      })
      .nullable(),
    updateOverdue: z.object({ detail: z.string() }).nullable(),
  }),
  impact: z.object({
    score: z.number().nullable(),
    summary: z.string().nullable(),
    trajectory: z.enum(Trajectory),
  }),
  milestones: z.array(milestoneViewSchema),
  risks: z.array(
    z.object({
      id: z.uuid(),
      type: z.enum(RiskType),
      title: z.string(),
      severity: z.enum(Severity),
      status: z.enum(RiskStatus),
      owner: personRefSchema.nullable(),
      dueDate: isoDate.nullable(),
      escalationLevel: z.int().nullable(),
    }),
  ),
  dependencies: z.object({
    blockedBy: z.array(dependencyViewSchema),
    enables: z.array(dependencyViewSchema),
  }),
  kpis: z.array(z.object({ id: z.uuid(), code: z.string(), name: z.string() })),
  progressHistory: z.array(
    z.object({ asOf: isoDate, planned: z.number(), verified: z.number() }),
  ),
  activity: z.array(
    z.object({
      action: z.string(),
      summary: z.string(),
      at: isoDateTime,
      actor: personRefSchema.nullable(),
    }),
  ),
});
export type InitiativeDetail = z.infer<typeof initiativeDetailSchema>;

export const recalculationSummarySchema = z.object({
  checked: z.int().min(0),
  changed: z.int().min(0),
  /** Codes whose status changed, with old → new. */
  healthChanges: z.array(
    z.object({ code: z.string(), from: z.enum(Health), to: z.enum(Health) }),
  ),
  /** Pillars/objectives whose rolled-up scores or health changed. */
  elementsChanged: z.int().min(0),
});
export type RecalculationSummary = z.infer<typeof recalculationSummarySchema>;

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export const overrideSchema = z.object({
  health: z.enum(['GREEN', 'AMBER', 'RED']),
  reason: z
    .string()
    .trim()
    .min(10, 'Explain the override in at least 10 characters')
    .max(1000),
  /** Defaults to the longest the organisation allows. */
  expiresAt: isoDate.optional(),
});
export type OverrideInput = z.output<typeof overrideSchema>;

const money = z.number().finite().min(0).max(1e15);
const datesInOrder = (start?: string | null, end?: string | null) =>
  !start || !end || end >= start;

export const objectiveLinkSchema = z.object({
  elementId: z.uuid(),
  /** Share of the element this initiative delivers (0–100]. */
  weight: z.number().gt(0).max(100),
  isPrimary: z.boolean().default(false),
});

const objectiveLinks = z
  .array(objectiveLinkSchema)
  .min(1, 'Link at least one objective')
  .max(20)
  .refine(
    (links) => links.filter((l) => l.isPrimary).length === 1,
    'Mark exactly one objective as primary',
  )
  .refine(
    (links) => new Set(links.map((l) => l.elementId)).size === links.length,
    'Each objective once',
  );

export const createInitiativeSchema = z
  .object({
    /** Suggested from the pillar (e.g. DIG-016) when omitted. */
    code: codeSchema.optional(),
    title: z.string().trim().min(3).max(200),
    description: clearableText(4000).optional(),
    businessCase: clearableText(8000).optional(),
    scope: clearableText(4000).optional(),
    objectives: objectiveLinks,
    ownerId: z.uuid().nullable().default(null),
    sponsorId: z.uuid().nullable().default(null),
    benefitsOwnerId: z.uuid().nullable().default(null),
    departmentId: z.uuid().nullable().default(null),
    priority: z.int().min(1).max(5).default(2),
    isSensitive: z.boolean().default(false),
    baselineStart: isoDate.nullable().default(null),
    baselineEnd: isoDate.nullable().default(null),
    baselineBudget: money.nullable().default(null),
    /** Proposals enter the pipeline; the Strategy Office may also keep drafts. */
    status: z.enum(['DRAFT', 'PROPOSED']).default('PROPOSED'),
    planId: z.uuid().optional(),
  })
  .refine((i) => datesInOrder(i.baselineStart, i.baselineEnd), {
    message: 'The end date must be on or after the start date',
    path: ['baselineEnd'],
  });
export type CreateInitiativeInput = z.output<typeof createInitiativeSchema>;

export const updateInitiativeSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: clearableText(4000),
    businessCase: clearableText(8000),
    scope: clearableText(4000),
    ownerId: z.uuid().nullable(),
    sponsorId: z.uuid().nullable(),
    benefitsOwnerId: z.uuid().nullable(),
    departmentId: z.uuid().nullable(),
    priority: z.int().min(1).max(5),
    isSensitive: z.boolean(),
    baselineStart: isoDate.nullable(),
    baselineEnd: isoDate.nullable(),
    baselineBudget: money.nullable(),
    forecastEnd: isoDate.nullable(),
    spentToDate: money.nullable(),
  })
  .partial()
  .refine((i) => Object.keys(i).length > 0, 'Nothing to update');
export type UpdateInitiativeInput = z.output<typeof updateInitiativeSchema>;

export const objectivesSchema = z.object({ objectives: objectiveLinks });
export type ObjectivesInput = z.output<typeof objectivesSchema>;

export const statusChangeSchema = z.object({
  status: z.enum(InitiativeStatus),
  reason: z
    .string()
    .trim()
    .min(10, 'Explain the change in at least 10 characters')
    .max(1000)
    .optional(),
});
export type StatusChangeInput = z.output<typeof statusChangeSchema>;

const milestoneFields = {
  title: z.string().trim().min(2).max(200),
  weight: z.number().min(0).max(100),
  isCritical: z.boolean(),
  evidenceRequired: z.boolean(),
  baselineStartDate: isoDate.nullable(),
  baselineDate: isoDate,
  forecastDate: isoDate.nullable(),
  sortOrder: z.int().min(0).max(10_000),
};

export const createMilestoneSchema = z
  .object({
    ...milestoneFields,
    isCritical: milestoneFields.isCritical.default(false),
    evidenceRequired: milestoneFields.evidenceRequired.default(true),
    baselineStartDate: milestoneFields.baselineStartDate.default(null),
    forecastDate: milestoneFields.forecastDate.default(null),
    sortOrder: milestoneFields.sortOrder.optional(),
  })
  .refine((m) => datesInOrder(m.baselineStartDate, m.baselineDate), {
    message: 'The due date must be on or after the start date',
    path: ['baselineDate'],
  });
export type CreateMilestoneInput = z.output<typeof createMilestoneSchema>;

export const updateMilestoneSchema = z
  .object(milestoneFields)
  .partial()
  .refine((m) => Object.keys(m).length > 0, 'Nothing to update');
export type UpdateMilestoneInput = z.output<typeof updateMilestoneSchema>;

export const createTaskSchema = z.object({
  title: z.string().trim().min(2).max(200),
  assigneeId: z.uuid().nullable().default(null),
  dueDate: isoDate.nullable().default(null),
});
export type CreateTaskInput = z.output<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    assigneeId: z.uuid().nullable(),
    dueDate: isoDate.nullable(),
    status: z.enum(TaskStatus),
  })
  .partial()
  .refine((t) => Object.keys(t).length > 0, 'Nothing to update');
export type UpdateTaskInput = z.output<typeof updateTaskSchema>;

export const createDependencySchema = z.object({
  /** The initiative this one waits on. */
  toInitiativeId: z.uuid(),
  description: clearableText(1000).default(null),
  isCriticalPath: z.boolean().default(false),
  neededBy: isoDate.nullable().default(null),
  status: z.enum(['ON_TRACK', 'AT_RISK', 'BLOCKED']).default('ON_TRACK'),
});
export type CreateDependencyInput = z.output<typeof createDependencySchema>;

export const updateDependencySchema = z
  .object({
    description: clearableText(1000),
    isCriticalPath: z.boolean(),
    neededBy: isoDate.nullable(),
    status: z.enum(DependencyStatus),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Nothing to update');
export type UpdateDependencyInput = z.output<typeof updateDependencySchema>;
