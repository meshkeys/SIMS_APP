import type { MyUpdates, UpdateForm } from '@sims/contracts';

const id = (n: number) =>
  `0192a1b2-c3d4-7e5f-8a9b-${String(n).padStart(12, '0')}`;

export const PERIOD_ID = id(500);
export const DIG_004 = id(4);
export const REV_005 = id(5);
export const ADA = id(900);

export const MY_UPDATES: MyUpdates = {
  period: {
    id: PERIOD_ID,
    name: 'October 2026',
    status: 'OWNER_SUBMISSION',
    submissionDueAt: '2026-10-17T16:00:00.000Z',
  },
  items: [
    {
      initiativeId: DIG_004,
      code: 'DIG-004',
      title: 'Launch Digital Investment Platform',
      status: 'DRAFT',
      actionNeeded: true,
      dueAt: '2026-10-17T16:00:00.000Z',
      overdue: false,
      savedAt: '2026-10-16T09:42:00.000Z',
      submittedAt: null,
    },
    {
      initiativeId: REV_005,
      code: 'REV-005',
      title: 'Bancassurance Product Bundle',
      status: 'NOT_STARTED',
      actionNeeded: true,
      dueAt: '2026-10-17T16:00:00.000Z',
      overdue: false,
      savedAt: null,
      submittedAt: null,
    },
  ],
};

const line = (
  n: number,
  title: string,
  weight: number,
  lastVerified: number,
  over: Partial<UpdateForm['lines'][number]> = {},
): UpdateForm['lines'][number] => ({
  milestoneId: id(100 + n),
  title,
  weight,
  isCritical: false,
  baselineDate: '2026-12-31',
  forecastDate: null,
  lastVerified,
  claimed: null,
  verified: null,
  locked: false,
  evidenceRequired: true,
  evidenceCount: 0,
  needsEvidence: false,
  evidence: [],
  note: null,
  ...over,
});

/** DIG-004's October update, as in the wireframe, before any claims. */
export const FORM: UpdateForm = {
  period: {
    id: PERIOD_ID,
    name: 'October 2026',
    status: 'OWNER_SUBMISSION',
    submissionDueAt: '2026-10-17T16:00:00.000Z',
    locked: false,
  },
  initiative: {
    id: DIG_004,
    code: 'DIG-004',
    title: 'Launch Digital Investment Platform',
    owner: {
      membershipId: ADA,
      name: 'Hassan Danjuma',
      jobTitle: 'Head, Digital Business',
    },
    sponsor: null,
  },
  update: {
    id: id(600),
    status: 'DRAFT',
    submittedBy: null,
    savedAt: '2026-10-16T09:42:00.000Z',
    submittedAt: null,
    reviewedAt: null,
    approvedAt: null,
    claimedProgress: 0,
    verifiedProgress: null,
    progressNarrative: null,
    varianceExplanation: null,
    recoveryAction: null,
    nextSteps: null,
    needsDecision: false,
  },
  lines: [
    line(1, 'Business case approved', 20, 100, { locked: true, claimed: 100 }),
    line(2, 'Technology development', 40, 75, { evidenceCount: 1 }),
    line(3, 'Testing and deployment', 25, 30),
    line(4, 'Commercial launch', 15, 0, { evidenceRequired: false }),
  ],
  evaluation: {
    claimedCompletion: 56.5,
    plannedCompletion: 74,
    variancePp: -17.5,
    healthPreview: 'AMBER',
    varianceThresholdPp: 5,
    checklist: [],
    canSubmit: false,
  },
  risks: [
    {
      id: id(700),
      type: 'ISSUE',
      title: 'Core banking API not ready for integration testing',
      severity: 'CRITICAL',
    },
    {
      id: id(701),
      type: 'RISK',
      title: 'SEC product approval may slip past launch date',
      severity: 'HIGH',
    },
  ],
  comments: [],
  can: {
    edit: true,
    submit: true,
    verify: false,
    challenge: false,
    approve: false,
    comment: true,
  },
};
