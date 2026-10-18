import type { UpdateStatus } from '../../generated/prisma/enums.js';

/**
 * Does an initiative owe an update for a period? Only if it was active
 * before the period's deadline and had started by the period's end — a new
 * initiative is never chased for a cycle it was not part of.
 */
export function owesUpdate(
  initiative: { activatedAt: Date | null; baselineStart: Date | null },
  period: { submissionDueAt: Date | null; endDate: Date },
): boolean {
  const activeInTime =
    !initiative.activatedAt ||
    !period.submissionDueAt ||
    initiative.activatedAt < period.submissionDueAt;
  const startedInTime =
    !initiative.baselineStart || initiative.baselineStart <= period.endDate;
  return activeInTime && startedInTime;
}

/** Statuses that count as "in" for the cycle tracker. */
export const SUBMITTED_STATUSES: readonly UpdateStatus[] = [
  'SUBMITTED',
  'CHALLENGED',
  'REVIEWED',
  'APPROVED',
];

/**
 * Update workflow:
 *   DRAFT ──submit──▶ SUBMITTED ──verify──▶ REVIEWED ──approve──▶ APPROVED
 *                       │                      │
 *                       └──challenge──▶ CHALLENGED ◀──challenge (sponsor)
 *   CHALLENGED ──resubmit──▶ SUBMITTED
 * Owners can edit only DRAFT and CHALLENGED updates; APPROVED is final.
 */
export type UpdateAction =
  'EDIT' | 'SUBMIT' | 'VERIFY' | 'CHALLENGE' | 'APPROVE';

const ALLOWED: Record<UpdateAction, readonly UpdateStatus[]> = {
  EDIT: ['DRAFT', 'CHALLENGED'],
  SUBMIT: ['DRAFT', 'CHALLENGED'],
  VERIFY: ['SUBMITTED'],
  CHALLENGE: ['SUBMITTED', 'REVIEWED'],
  APPROVE: ['REVIEWED'],
};

export function canPerform(
  action: UpdateAction,
  status: UpdateStatus,
): boolean {
  return ALLOWED[action].includes(status);
}
