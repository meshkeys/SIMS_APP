import { z } from 'zod';
import { Role, Severity } from '../../generated/prisma/enums.js';

const isoDate = z.iso.date('Use a date like 2026-12-31');
const scale = z.int().min(1).max(5);
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

// ------------------------------------------------------------------ risks

export const createRiskSchema = z
  .object({
    /** Omit for a portfolio-level risk (Strategy Office). */
    initiativeId: z.uuid().nullable().default(null),
    type: z.enum(['RISK', 'ISSUE']),
    title: z.string().trim().min(3).max(200),
    description: text(4000).default(null),
    /** Risks: how likely (1–5) and how bad (1–5); severity follows from them. */
    likelihood: scale.nullable().default(null),
    impact: scale.nullable().default(null),
    /** Issues (already happening): severity is set directly. */
    severity: z.enum(Severity).optional(),
    ownerId: z.uuid().nullable().default(null),
    mitigation: text(4000).default(null),
    dueDate: isoDate.nullable().default(null),
  })
  .superRefine((risk, ctx) => {
    if (risk.type === 'RISK') {
      if (risk.likelihood === null)
        ctx.addIssue({
          code: 'custom',
          path: ['likelihood'],
          message: 'Rate how likely it is (1–5)',
        });
      if (risk.impact === null)
        ctx.addIssue({
          code: 'custom',
          path: ['impact'],
          message: 'Rate its impact (1–5)',
        });
    } else if (!risk.severity) {
      ctx.addIssue({
        code: 'custom',
        path: ['severity'],
        message: 'Set how severe the issue is',
      });
    }
  });
export type CreateRiskInput = z.output<typeof createRiskSchema>;

export const updateRiskSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: text(4000),
    likelihood: scale,
    impact: scale,
    severity: z.enum(Severity),
    ownerId: z.uuid().nullable(),
    mitigation: text(4000),
    dueDate: isoDate.nullable(),
    status: z.enum(['OPEN', 'MITIGATED', 'CLOSED']),
  })
  .partial()
  .refine((risk) => Object.keys(risk).length > 0, 'Nothing to update');
export type UpdateRiskInput = z.output<typeof updateRiskSchema>;

const list = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((part) => part.trim().toUpperCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values)));

export const riskQuerySchema = z.object({
  type: z.enum(['RISK', 'ISSUE']).optional(),
  severity: list(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: list(['OPEN', 'MITIGATED', 'CLOSED']).optional(),
  initiativeId: z.uuid().optional(),
  ownerId: z.uuid().optional(),
  /** Heatmap cell filter. */
  likelihood: z.coerce.number().int().min(1).max(5).optional(),
  impact: z.coerce.number().int().min(1).max(5).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type RiskQuery = z.output<typeof riskQuerySchema>;

// -------------------------------------------------------------- decisions

export const decisionQuerySchema = z.object({
  /** open: the "Decisions required" panel; log: decided items, newest first. */
  view: z.enum(['open', 'log']).default('open'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type DecisionQuery = z.output<typeof decisionQuerySchema>;

export const createDecisionSchema = z.object({
  title: z.string().trim().min(5).max(300),
  context: text(4000).default(null),
  initiativeId: z.uuid().nullable().default(null),
  requiredFrom: z.enum(Role),
  requiredFromId: z.uuid().nullable().default(null),
  dueDate: isoDate.nullable().default(null),
});
export type CreateDecisionInput = z.output<typeof createDecisionSchema>;

export const decideSchema = z
  .object({
    outcome: z.enum(['APPROVED', 'REJECTED', 'DEFERRED']),
    notes: z.string().trim().max(4000).optional(),
    deferredUntil: isoDate.optional(),
  })
  .superRefine((d, ctx) => {
    if (d.outcome !== 'APPROVED' && (!d.notes || d.notes.length < 5)) {
      ctx.addIssue({
        code: 'custom',
        path: ['notes'],
        message: 'Say why (5+ characters)',
      });
    }
    if (d.outcome === 'DEFERRED' && !d.deferredUntil) {
      ctx.addIssue({
        code: 'custom',
        path: ['deferredUntil'],
        message: 'Choose when to revisit it',
      });
    }
  });
export type DecideInput = z.output<typeof decideSchema>;

// -------------------------------------------------------- change requests

const changesSchema = z.object({
  baselineStart: isoDate.nullable().optional(),
  baselineEnd: isoDate.nullable().optional(),
  baselineBudget: z.number().finite().min(0).max(1e15).nullable().optional(),
  scope: text(4000).optional(),
  milestones: z
    .array(
      z.object({
        milestoneId: z.uuid(),
        weight: z.number().min(0).max(100).optional(),
        isCritical: z.boolean().optional(),
        baselineStartDate: isoDate.nullable().optional(),
        baselineDate: isoDate.optional(),
      }),
    )
    .max(50)
    .optional(),
  addMilestones: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(200),
        weight: z.number().min(0).max(100),
        isCritical: z.boolean().optional(),
        baselineStartDate: isoDate.nullable().optional(),
        baselineDate: isoDate,
      }),
    )
    .max(20)
    .optional(),
  removeMilestoneIds: z.array(z.uuid()).max(50).optional(),
});

/** What each kind of request may touch. */
const ALLOWED_KEYS = {
  BASELINE_CHANGE: [
    'baselineStart',
    'baselineEnd',
    'milestones',
    'addMilestones',
    'removeMilestoneIds',
  ],
  BUDGET_CHANGE: ['baselineBudget'],
  SCOPE_CHANGE: ['scope'],
} as const;

export const createChangeRequestSchema = z
  .object({
    type: z.enum(['BASELINE_CHANGE', 'BUDGET_CHANGE', 'SCOPE_CHANGE']),
    changes: changesSchema,
    justification: z
      .string()
      .trim()
      .min(20, 'Explain why the change is needed (20+ characters)')
      .max(4000),
    dueDate: isoDate.optional(),
  })
  .superRefine((request, ctx) => {
    const allowed = ALLOWED_KEYS[request.type] as readonly string[];
    for (const key of Object.keys(request.changes)) {
      if (!allowed.includes(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['changes', key],
          message: `A ${request.type.toLowerCase().replace('_', ' ')} cannot change ${key}`,
        });
      }
    }
  });
export type CreateChangeRequestInput = z.output<
  typeof createChangeRequestSchema
>;

export const changeRequestQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']).optional(),
  initiativeId: z.uuid().optional(),
});
export type ChangeRequestQuery = z.output<typeof changeRequestQuerySchema>;

export const idSchema = z.uuid();
