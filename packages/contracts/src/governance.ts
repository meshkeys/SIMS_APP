import { z } from 'zod';
import {
  clearableText,
  commaList,
  initiativeRefSchema,
  isoDate,
  isoDateTime,
  pageMeta,
  personRefSchema,
} from './common.js';
import {
  ApprovalStatus,
  ApprovalType,
  DecisionOutcome,
  RiskStatus,
  RiskType,
  Role,
  Severity,
} from './enums.js';

const scale = z.int().min(1).max(5);

// ---------------------------------------------------------------------------
// Risks and issues
// ---------------------------------------------------------------------------

export const createRiskSchema = z
  .object({
    /** Omit for a portfolio-level risk (Strategy Office). */
    initiativeId: z.uuid().nullable().default(null),
    type: z.enum(RiskType),
    title: z.string().trim().min(3).max(200),
    description: clearableText(4000).default(null),
    /** Risks: how likely (1–5) and how bad (1–5); severity follows from them. */
    likelihood: scale.nullable().default(null),
    impact: scale.nullable().default(null),
    /** Issues (already happening): severity is set directly. */
    severity: z.enum(Severity).optional(),
    ownerId: z.uuid().nullable().default(null),
    mitigation: clearableText(4000).default(null),
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
    description: clearableText(4000),
    likelihood: scale,
    impact: scale,
    severity: z.enum(Severity),
    ownerId: z.uuid().nullable(),
    mitigation: clearableText(4000),
    dueDate: isoDate.nullable(),
    status: z.enum(RiskStatus),
  })
  .partial()
  .refine((risk) => Object.keys(risk).length > 0, 'Nothing to update');
export type UpdateRiskInput = z.output<typeof updateRiskSchema>;

export const riskQuerySchema = z.object({
  type: z.enum(RiskType).optional(),
  severity: commaList(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: commaList(['OPEN', 'MITIGATED', 'CLOSED']).optional(),
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

export const riskViewSchema = z.object({
  id: z.uuid(),
  type: z.enum(RiskType),
  title: z.string(),
  description: z.string().nullable(),
  likelihood: z.int().nullable(),
  impact: z.int().nullable(),
  /** likelihood × impact (risks only). */
  score: z.int().nullable(),
  severity: z.enum(Severity),
  status: z.enum(RiskStatus),
  initiative: initiativeRefSchema.nullable(),
  owner: personRefSchema.nullable(),
  mitigation: z.string().nullable(),
  dueDate: isoDate.nullable(),
  closedAt: isoDateTime.nullable(),
  /** The open escalation it has raised, if any. */
  escalation: z.object({ reference: z.string(), level: z.int() }).nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type RiskView = z.infer<typeof riskViewSchema>;

export const riskRegisterSchema = z.object({
  items: z.array(riskViewSchema),
  ...pageMeta,
  totalPages: z.int().min(1),
  /** Open risks on the 5×5 grid (rows: impact 5→1; columns: likelihood 1→5), under the other filters. */
  heatmap: z.array(z.array(z.int().min(0)).length(5)).length(5),
  counts: z.object({
    risks: z.int().min(0),
    issues: z.int().min(0),
    bySeverity: z.object({
      LOW: z.int().min(0),
      MEDIUM: z.int().min(0),
      HIGH: z.int().min(0),
      CRITICAL: z.int().min(0),
    }),
  }),
});
export type RiskRegister = z.infer<typeof riskRegisterSchema>;

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export const decisionQuerySchema = z.object({
  /** open: the "Decisions required" panel; log: decided items, newest first. */
  view: z.enum(['open', 'log']).default('open'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type DecisionQuery = z.output<typeof decisionQuerySchema>;

export const createDecisionSchema = z.object({
  title: z.string().trim().min(5).max(300),
  context: clearableText(4000).default(null),
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

export const decisionViewSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  title: z.string(),
  context: z.string().nullable(),
  /** A change request, a proposed rule change (both maker-checker), or a decision. */
  kind: z.enum(['CHANGE_REQUEST', 'RULE_CHANGE', 'DECISION']),
  initiative: initiativeRefSchema.nullable(),
  /** Role that must decide, and the named person when there is one. */
  requiredFrom: z.enum(Role),
  decisionOwner: personRefSchema.nullable(),
  dueDate: isoDate.nullable(),
  /** Days past the due date while still open; 0 otherwise. */
  overdueDays: z.int().min(0),
  outcome: z.enum(DecisionOutcome),
  outcomeNotes: z.string().nullable(),
  deferredUntil: isoDate.nullable(),
  decidedBy: personRefSchema.nullable(),
  decidedAt: isoDateTime.nullable(),
  changeRequestId: z.uuid().nullable(),
  /** Whether the caller may record the decision now. */
  canDecide: z.boolean(),
});
export type DecisionView = z.infer<typeof decisionViewSchema>;

export const decisionPageSchema = z.object({
  items: z.array(decisionViewSchema),
  ...pageMeta,
});
export type DecisionPage = z.infer<typeof decisionPageSchema>;

// ---------------------------------------------------------------------------
// Change requests (maker-checker)
// ---------------------------------------------------------------------------

export const requestedChangesSchema = z.object({
  baselineStart: isoDate.nullable().optional(),
  baselineEnd: isoDate.nullable().optional(),
  baselineBudget: z.number().finite().min(0).max(1e15).nullable().optional(),
  scope: clearableText(4000).optional(),
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
export type RequestedChanges = z.output<typeof requestedChangesSchema>;

export const CHANGE_REQUEST_TYPES = [
  'BASELINE_CHANGE',
  'BUDGET_CHANGE',
  'SCOPE_CHANGE',
] as const;
export type ChangeRequestType = (typeof CHANGE_REQUEST_TYPES)[number];

/** What each kind of request may touch. */
export const CHANGE_REQUEST_ALLOWED_KEYS = {
  BASELINE_CHANGE: [
    'baselineStart',
    'baselineEnd',
    'milestones',
    'addMilestones',
    'removeMilestoneIds',
  ],
  BUDGET_CHANGE: ['baselineBudget'],
  SCOPE_CHANGE: ['scope'],
} as const satisfies Record<
  ChangeRequestType,
  readonly (keyof RequestedChanges)[]
>;

export const createChangeRequestSchema = z
  .object({
    type: z.enum(CHANGE_REQUEST_TYPES),
    changes: requestedChangesSchema,
    justification: z
      .string()
      .trim()
      .min(20, 'Explain why the change is needed (20+ characters)')
      .max(4000),
    dueDate: isoDate.optional(),
  })
  .superRefine((request, ctx) => {
    const allowed = CHANGE_REQUEST_ALLOWED_KEYS[
      request.type
    ] as readonly string[];
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
  status: z.enum(ApprovalStatus).optional(),
  initiativeId: z.uuid().optional(),
});
export type ChangeRequestQuery = z.output<typeof changeRequestQuerySchema>;

export const changeRequestViewSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  type: z.enum(ApprovalType),
  status: z.enum(ApprovalStatus),
  initiative: initiativeRefSchema,
  changes: requestedChangesSchema,
  /** The baseline values the change replaces. */
  before: z.record(z.string(), z.unknown()),
  justification: z.string().nullable(),
  requestedBy: personRefSchema.nullable(),
  approver: personRefSchema.nullable(),
  decisionId: z.uuid().nullable(),
  decisionReason: z.string().nullable(),
  decidedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type ChangeRequestView = z.infer<typeof changeRequestViewSchema>;
