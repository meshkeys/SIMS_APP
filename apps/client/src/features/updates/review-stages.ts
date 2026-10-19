import type { UpdateStatus } from '@sims/contracts';

/** The review queue's tabs and the update status each shows (null: all submitted). */
export const REVIEW_STAGES = {
  'to-verify': { label: 'To verify', status: 'SUBMITTED' },
  'with-sponsor': { label: 'Waiting for sponsor', status: 'REVIEWED' },
  challenged: { label: 'Challenged', status: 'CHALLENGED' },
  approved: { label: 'Approved', status: 'APPROVED' },
  all: { label: 'All', status: null },
} as const satisfies Record<
  string,
  { label: string; status: UpdateStatus | null }
>;
export type ReviewStage = keyof typeof REVIEW_STAGES;
