import { z } from 'zod';
import {
  clearableText,
  isoDate,
  isoDateTime,
  personRefSchema,
} from './common.js';
import {
  CommentKind,
  Health,
  PeriodStatus,
  RiskType,
  Severity,
  UpdateStatus,
} from './enums.js';

const percent = z.number().min(0).max(100);

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const openPeriodSchema = z
  .object({
    /** e.g. "November 2026"; unique within the plan. */
    name: z.string().trim().min(3).max(60),
    startDate: isoDate,
    endDate: isoDate,
    /** First day owners can submit; stage deadlines follow in working days. */
    opensOn: isoDate,
    planId: z.uuid().optional(),
  })
  .refine((p) => p.endDate >= p.startDate, {
    message: 'The end date must be on or after the start date',
    path: ['endDate'],
  });
export type OpenPeriodInput = z.output<typeof openPeriodSchema>;

export const lockPeriodSchema = z.object({
  /**
   * Updates the Strategy Office verified but the sponsor has not confirmed by
   * the deadline: approve them as part of locking (recorded as such).
   */
  approveAwaitingSponsor: z.boolean().default(false),
});
export type LockPeriodInput = z.output<typeof lockPeriodSchema>;

export const updateDraftSchema = z.object({
  lines: z
    .array(
      z.object({
        milestoneId: z.uuid(),
        claimedCompletion: percent,
        forecastDate: isoDate.nullable().optional(),
        note: clearableText(500).optional(),
      }),
    )
    .max(100)
    .default([]),
  progressNarrative: clearableText(4000).optional(),
  varianceExplanation: clearableText(4000).optional(),
  recoveryAction: clearableText(4000).optional(),
  nextSteps: clearableText(4000).optional(),
  /** "I need a management decision to proceed". */
  needsDecision: z.boolean().optional(),
});
export type UpdateDraftInput = z.output<typeof updateDraftSchema>;

export const verifySchema = z.object({
  lines: z
    .array(z.object({ milestoneId: z.uuid(), verifiedCompletion: percent }))
    .min(1)
    .max(100),
  comment: z.string().trim().min(1).max(4000).optional(),
});
export type VerifyInput = z.output<typeof verifySchema>;

export const challengeSchema = z.object({
  comment: z
    .string()
    .trim()
    .min(10, 'Explain what needs to change (10+ characters)')
    .max(4000),
});
export type ChallengeInput = z.output<typeof challengeSchema>;

export const approveSchema = z.object({
  comment: z.string().trim().min(1).max(4000).optional(),
});
export type ApproveInput = z.output<typeof approveSchema>;

export const commentSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  parentId: z.uuid().optional(),
});
export type CommentInput = z.output<typeof commentSchema>;

export const updatesQuerySchema = z.object({
  status: z.enum(UpdateStatus).optional(),
});
export type UpdatesQuery = z.output<typeof updatesQuerySchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

const count = z.int().min(0);

export const periodSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(PeriodStatus),
  startDate: isoDate,
  endDate: isoDate,
  deadlines: z.object({
    submissionOpensAt: isoDateTime.nullable(),
    submissionDueAt: isoDateTime.nullable(),
    strategyReviewDueAt: isoDateTime.nullable(),
    sponsorReviewDueAt: isoDateTime.nullable(),
    reportIssueDueAt: isoDateTime.nullable(),
  }),
  lockedAt: isoDateTime.nullable(),
  /** "Day 6 of 8" while the cycle runs. */
  cycleDay: z.object({ day: z.int(), of: z.int() }).nullable(),
  /** The cycle tracker: "29 of 32 in · 6 challenged · 3 pending". */
  counts: z.object({
    owed: count,
    in: count,
    outstanding: count,
    drafts: count,
    awaitingVerification: count,
    challenged: count,
    awaitingSponsor: count,
    approved: count,
  }),
});
export type PeriodSummary = z.infer<typeof periodSummarySchema>;

/** Not started yet, or the update's own status. */
export const MY_UPDATE_STATUSES = [
  'NOT_STARTED',
  ...Object.values(UpdateStatus),
] as ['NOT_STARTED', ...UpdateStatus[]];
export type MyUpdateStatus = UpdateStatus | 'NOT_STARTED';

const periodHeader = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(PeriodStatus),
  submissionDueAt: isoDateTime.nullable(),
});

export const myUpdatesSchema = z.object({
  period: periodHeader.nullable(),
  items: z.array(
    z.object({
      initiativeId: z.uuid(),
      code: z.string(),
      title: z.string(),
      status: z.enum(MY_UPDATE_STATUSES),
      /** Needs the owner's attention now (not started, draft, or challenged). */
      actionNeeded: z.boolean(),
      dueAt: isoDateTime.nullable(),
      overdue: z.boolean(),
      savedAt: isoDateTime.nullable(),
      submittedAt: isoDateTime.nullable(),
    }),
  ),
});
export type MyUpdates = z.infer<typeof myUpdatesSchema>;

/** One line of the pre-submission checklist. */
export const checklistItemSchema = z.object({
  key: z.enum([
    'ALL_MILESTONES',
    'EVIDENCE',
    'VARIANCE_EXPLANATION',
    'RECOVERY_ACTION',
    'NARRATIVE',
  ]),
  ok: z.boolean(),
  /** Blocking items must be fixed before submitting. */
  blocking: z.boolean(),
  message: z.string(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const updateFormSchema = z.object({
  period: periodHeader.extend({ locked: z.boolean() }),
  initiative: z.object({
    id: z.uuid(),
    code: z.string(),
    title: z.string(),
    owner: personRefSchema.nullable(),
    sponsor: personRefSchema.nullable(),
  }),
  update: z
    .object({
      id: z.uuid(),
      status: z.enum(UpdateStatus),
      submittedBy: personRefSchema.nullable(),
      savedAt: isoDateTime,
      submittedAt: isoDateTime.nullable(),
      reviewedAt: isoDateTime.nullable(),
      approvedAt: isoDateTime.nullable(),
      claimedProgress: z.number(),
      verifiedProgress: z.number().nullable(),
      progressNarrative: z.string().nullable(),
      varianceExplanation: z.string().nullable(),
      recoveryAction: z.string().nullable(),
      nextSteps: z.string().nullable(),
      needsDecision: z.boolean(),
    })
    .nullable(),
  lines: z.array(
    z.object({
      milestoneId: z.uuid(),
      title: z.string(),
      weight: z.number(),
      isCritical: z.boolean(),
      baselineDate: isoDate,
      forecastDate: isoDate.nullable(),
      lastVerified: z.number(),
      claimed: z.number().nullable(),
      verified: z.number().nullable(),
      /** Completed milestones are locked at 100%. */
      locked: z.boolean(),
      evidenceRequired: z.boolean(),
      evidenceCount: count,
      needsEvidence: z.boolean(),
      note: z.string().nullable(),
    }),
  ),
  evaluation: z.object({
    claimedCompletion: z.number(),
    plannedCompletion: z.number(),
    variancePp: z.number(),
    /** The status the claimed figures would give, from the rules engine. */
    healthPreview: z.enum(Health).nullable(),
    /** Behind plan by more than this (pp) needs a variance explanation and recovery action. */
    varianceThresholdPp: z.number(),
    checklist: z.array(checklistItemSchema),
    canSubmit: z.boolean(),
  }),
  risks: z.array(
    z.object({
      id: z.uuid(),
      type: z.enum(RiskType),
      title: z.string(),
      severity: z.enum(Severity),
    }),
  ),
  comments: z.array(
    z.object({
      id: z.uuid(),
      parentId: z.uuid().nullable(),
      kind: z.enum(CommentKind),
      body: z.string(),
      author: personRefSchema.nullable(),
      at: isoDateTime,
    }),
  ),
  /** What the caller may do now, so the screen shows the right buttons. */
  can: z.object({
    edit: z.boolean(),
    submit: z.boolean(),
    verify: z.boolean(),
    challenge: z.boolean(),
    approve: z.boolean(),
    comment: z.boolean(),
  }),
});
export type UpdateForm = z.infer<typeof updateFormSchema>;

/** A row of the Strategy Office's review queue. */
export const updateListItemSchema = z.object({
  updateId: z.uuid(),
  initiativeId: z.uuid(),
  code: z.string(),
  title: z.string(),
  owner: personRefSchema.nullable(),
  status: z.enum(UpdateStatus),
  claimedProgress: z.number(),
  verifiedProgress: z.number().nullable(),
  plannedProgress: z.number().nullable(),
  submittedAt: isoDateTime.nullable(),
  /** Milestone lines claiming progress without the evidence they need. */
  evidenceFlags: count,
});
export type UpdateListItem = z.infer<typeof updateListItemSchema>;
