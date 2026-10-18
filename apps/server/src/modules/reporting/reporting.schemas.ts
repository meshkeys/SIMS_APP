import { z } from 'zod';

const isoDate = z.iso.date('Use a date like 2026-10-31');
const percent = z.number().min(0).max(100);
const commentary = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

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
        note: commentary(500).optional(),
      }),
    )
    .max(100)
    .default([]),
  progressNarrative: commentary(4000).optional(),
  varianceExplanation: commentary(4000).optional(),
  recoveryAction: commentary(4000).optional(),
  nextSteps: commentary(4000).optional(),
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
  status: z
    .enum(['DRAFT', 'SUBMITTED', 'CHALLENGED', 'REVIEWED', 'APPROVED'])
    .optional(),
});
export type UpdatesQuery = z.output<typeof updatesQuerySchema>;

export const idSchema = z.uuid();
