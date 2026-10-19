import { z } from 'zod';
import {
  commaList,
  initiativeRefSchema,
  isoDate,
  isoDateTime,
  personRefSchema,
} from './common.js';
import { escalationSummarySchema } from './dashboard.js';
import {
  DependencyStatus,
  EscalationSource,
  EscalationStatus,
  Role,
  Severity,
} from './enums.js';

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const escalationQuerySchema = z.object({
  /** Default: open items only. */
  status: commaList(['OPEN', 'RESOLVED', 'WITHDRAWN']).optional(),
  level: z.coerce.number().int().min(1).max(10).optional(),
  initiativeId: z.uuid().optional(),
});
export type EscalationQuery = z.output<typeof escalationQuerySchema>;

/** Sources people raise by hand; the others are raised by the system. */
export const RAISABLE_SOURCES = ['MANUAL', 'RESOURCE_CONFLICT'] as const;

export const raiseEscalationSchema = z.object({
  title: z.string().trim().min(5, 'Describe the problem in a few words').max(200),
  description: z.string().trim().max(2000).nullable().default(null),
  severity: z.enum(Severity),
  /** Leave empty for a portfolio-level problem (Strategy Office only). */
  initiativeId: z.uuid().nullable().default(null),
  /** Escalate a logged risk or issue: its initiative is used. */
  riskIssueId: z.uuid().nullable().default(null),
  source: z.enum(RAISABLE_SOURCES).default('MANUAL'),
});
export type RaiseEscalationInput = z.output<typeof raiseEscalationSchema>;

const note = (what: string) =>
  z
    .string()
    .trim()
    .min(10, `Say ${what} in at least 10 characters`)
    .max(2000);

export const moveEscalationSchema = z.object({ note: note('why') });
export type MoveEscalationInput = z.output<typeof moveEscalationSchema>;

export const resolveEscalationSchema = z.object({
  resolution: note('how it was resolved'),
});
export type ResolveEscalationInput = z.output<typeof resolveEscalationSchema>;

export const withdrawEscalationSchema = z.object({ reason: note('why') });
export type WithdrawEscalationInput = z.output<typeof withdrawEscalationSchema>;

export const dependencyQuerySchema = z.object({
  /** Default: blocked and at risk. */
  status: commaList(['ON_TRACK', 'AT_RISK', 'BLOCKED', 'RESOLVED']).optional(),
});
export type DependencyQuery = z.output<typeof dependencyQuerySchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const escalationItemSchema = escalationSummarySchema.extend({
  source: z.enum(EscalationSource),
  status: z.enum(EscalationStatus),
  raisedAt: isoDateTime,
  raisedBy: personRefSchema.nullable(),
  riskIssue: z
    .object({
      id: z.uuid(),
      type: z.enum(['RISK', 'ISSUE']),
      title: z.string(),
    })
    .nullable(),
  dependency: z
    .object({
      id: z.uuid(),
      from: initiativeRefSchema,
      to: initiativeRefSchema,
    })
    .nullable(),
  /** Days until it moves up on its own; null at a level reached only by decision. */
  nextLevelInDays: z.int().min(0).nullable(),
  resolvedAt: isoDateTime.nullable(),
  resolution: z.string().nullable(),
  can: z.object({
    escalate: z.boolean(),
    deEscalate: z.boolean(),
    resolve: z.boolean(),
    withdraw: z.boolean(),
  }),
});
export type EscalationItem = z.infer<typeof escalationItemSchema>;

export const ladderLevelSchema = z.object({
  level: z.int().min(1),
  name: z.string(),
  description: z.string().nullable(),
  decidedBy: z.discriminatedUnion('type', [
    z.object({ type: z.literal('INITIATIVE_OWNER') }),
    z.object({ type: z.literal('INITIATIVE_SPONSOR') }),
    z.object({ type: z.literal('ROLE'), role: z.enum(Role) }),
  ]),
  autoEscalateAfterDays: z.int().min(0).nullable(),
  /** Open items at this level (that the caller may see). */
  open: z.int().min(0),
});
export type LadderLevel = z.infer<typeof ladderLevelSchema>;

/** The escalation centre: the organisation's ladder with counts, and the items. */
export const escalationCentreSchema = z.object({
  ladder: z.array(ladderLevelSchema),
  criticalStartsAtLevel: z.int().min(1).nullable(),
  /** Oldest first. */
  items: z.array(escalationItemSchema),
  total: z.int().min(0),
  can: z.object({
    /** Raise a portfolio-level escalation (no initiative): the Strategy Office. */
    raisePortfolio: z.boolean(),
  }),
});
export type EscalationCentre = z.infer<typeof escalationCentreSchema>;

export const escalationDetailSchema = escalationItemSchema.extend({
  description: z.string().nullable(),
  /** Every level change, oldest first. */
  history: z.array(
    z.object({
      fromLevel: z.int().nullable(),
      toLevel: z.int(),
      /** The level's name when it happened. */
      toLevelName: z.string(),
      reason: z.enum([
        'RAISED',
        'AUTO_TIMEOUT',
        'CRITICAL_SEVERITY',
        'MANUAL',
        'DE_ESCALATED',
      ]),
      note: z.string().nullable(),
      /** Null when the system moved it. */
      actor: personRefSchema.nullable(),
      at: isoDateTime,
    }),
  ),
});
export type EscalationDetail = z.infer<typeof escalationDetailSchema>;

export const sweepResultSchema = z.object({
  /** Items moved up the ladder by this run. */
  moved: z.int().min(0),
});
export type SweepResult = z.infer<typeof sweepResultSchema>;

export const portfolioDependencySchema = z.object({
  id: z.uuid(),
  /** The initiative that is waiting… */
  from: initiativeRefSchema,
  /** …on this one. */
  to: initiativeRefSchema,
  description: z.string().nullable(),
  status: z.enum(DependencyStatus),
  isCriticalPath: z.boolean(),
  blockedSince: isoDateTime.nullable(),
  neededBy: isoDate.nullable(),
});
export type PortfolioDependency = z.infer<typeof portfolioDependencySchema>;
