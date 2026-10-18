import { z } from 'zod';
import { Health } from '../../generated/prisma/enums.js';

/** Register tabs, matching the screen: Active · Pipeline · Closed · Cancelled. */
export const REGISTER_TABS = {
  active: ['ACTIVE', 'ON_HOLD'],
  pipeline: ['DRAFT', 'PROPOSED', 'APPROVED'],
  closed: ['CLOSED'],
  cancelled: ['CANCELLED'],
} as const;
export type RegisterTab = keyof typeof REGISTER_TABS;

/** "RED,AMBER" → ['RED', 'AMBER'] */
const healthList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.enum(Health)));

export const registerQuerySchema = z.object({
  tab: z.enum(['active', 'pipeline', 'closed', 'cancelled']).default('active'),
  /** One or more effective health values, e.g. `health=RED,AMBER`. */
  health: healthList.optional(),
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

export const overrideSchema = z.object({
  health: z.enum(['GREEN', 'AMBER', 'RED']),
  reason: z
    .string()
    .trim()
    .min(10, 'Explain the override in at least 10 characters')
    .max(1000),
  /** Defaults to the longest the organisation allows. */
  expiresAt: z.iso.date().optional(),
});
export type OverrideInput = z.output<typeof overrideSchema>;

export const idSchema = z.uuid();

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

const isoDate = z.iso.date('Use a date like 2026-12-31');
const money = z.number().finite().min(0).max(1e15);
const longText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));
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
    code: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$/,
        'Use up to 20 letters, digits, dots or hyphens',
      )
      .optional(),
    title: z.string().trim().min(3).max(200),
    description: longText(4000).optional(),
    businessCase: longText(8000).optional(),
    scope: longText(4000).optional(),
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
    description: longText(4000),
    businessCase: longText(8000),
    scope: longText(4000),
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
  status: z.enum([
    'DRAFT',
    'PROPOSED',
    'APPROVED',
    'ACTIVE',
    'ON_HOLD',
    'CLOSED',
    'CANCELLED',
  ]),
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
    status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']),
  })
  .partial()
  .refine((t) => Object.keys(t).length > 0, 'Nothing to update');
export type UpdateTaskInput = z.output<typeof updateTaskSchema>;

export const createDependencySchema = z.object({
  /** The initiative this one waits on. */
  toInitiativeId: z.uuid(),
  description: longText(1000).default(null),
  isCriticalPath: z.boolean().default(false),
  neededBy: isoDate.nullable().default(null),
  status: z.enum(['ON_TRACK', 'AT_RISK', 'BLOCKED']).default('ON_TRACK'),
});
export type CreateDependencyInput = z.output<typeof createDependencySchema>;

export const updateDependencySchema = z
  .object({
    description: longText(1000),
    isCriticalPath: z.boolean(),
    neededBy: isoDate.nullable(),
    status: z.enum(['ON_TRACK', 'AT_RISK', 'BLOCKED', 'RESOLVED']),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Nothing to update');
export type UpdateDependencyInput = z.output<typeof updateDependencySchema>;
