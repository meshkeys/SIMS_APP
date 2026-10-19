import type { ChangeRequestView, InitiativeDetail } from '@sims/contracts';

const id = (n: number) =>
  `0192a1b2-c3d4-7e5f-8a9b-${String(n).padStart(12, '0')}`;
const person = (n: number, name: string, jobTitle: string) => ({
  membershipId: id(n),
  name,
  jobTitle,
});

export const DIG_004_ID = id(4);

const milestone = (
  n: number,
  title: string,
  over: Partial<InitiativeDetail['milestones'][number]>,
): InitiativeDetail['milestones'][number] => ({
  id: id(100 + n),
  title,
  weight: 20,
  isCritical: false,
  status: 'IN_PROGRESS',
  baselineStartDate: null,
  baselineDate: '2026-10-15',
  forecastDate: null,
  actualDate: null,
  claimedCompletion: 0,
  verifiedCompletion: 0,
  contribution: 0,
  overdueDays: 0,
  evidenceCount: 0,
  tasks: [],
  ...over,
});

/** DIG-004 as in the wireframe: at risk, overridden from red. */
export const DIG_004: InitiativeDetail = {
  id: DIG_004_ID,
  code: 'DIG-004',
  title: 'Launch Digital Investment Platform',
  description: null,
  businessCase: 'Fee income from digital wealth customers.',
  scope: null,
  status: 'ACTIVE',
  priority: 1,
  isSensitive: false,
  plan: { id: id(1), name: 'FY2024–2026 Strategic Plan' },
  contributesTo: [
    {
      elementId: id(21),
      code: 'O2.1',
      title: 'Shift transactions to digital',
      weight: 70,
      isPrimary: true,
    },
    {
      elementId: id(22),
      code: 'O1.1',
      title: 'Grow non-interest income',
      weight: 30,
      isPrimary: false,
    },
  ],
  pillar: { id: id(11), code: 'P2', title: 'Digital Transformation' },
  owner: person(201, 'Hassan Danjuma', 'Head, Digital Business'),
  sponsor: person(202, 'Tunde Bakare', 'ED, Business'),
  benefitsOwner: person(203, 'Ifeoma Obi', 'Head, Wealth'),
  department: { id: id(301), name: 'Digital Business' },
  baseline: { start: '2026-03-01', end: '2026-12-31' },
  forecastEnd: null,
  actualEnd: null,
  budget: { baseline: 500_000_000, spent: 290_000_000, spentPct: 58 },
  lastVerifiedUpdateAt: '2026-10-11T10:00:00.000Z',
  execution: { verified: 65, planned: 74, variancePp: -9 },
  health: {
    effective: 'AMBER',
    calculated: 'RED',
    reasons: [
      {
        rule: 'PROGRESS_VS_PLAN',
        effect: 'BASE',
        result: 'AMBER',
        detail: '9 pp behind plan (threshold: Amber is 5–15 pp)',
      },
      {
        rule: 'OVERDUE_CRITICAL_MILESTONE',
        effect: 'FORCE_RED',
        result: 'RED',
        detail: 'Critical milestone "Vendor contract signed" overdue by 9 days',
      },
    ],
    override: {
      health: 'AMBER',
      reason:
        'Contract terms agreed; signature expected 22 Oct. Delivery dates unaffected.',
      by: person(202, 'Tunde Bakare', 'ED, Business'),
      at: '2026-10-13T09:00:00.000Z',
      expiresAt: '2026-10-31T22:59:59.000Z',
    },
    updateOverdue: null,
  },
  impact: {
    score: 10,
    summary: 'Pilot only. Benefits expected from Q1 2027',
    trajectory: 'SLIGHTLY_BEHIND',
  },
  milestones: [
    milestone(1, 'Business case approved', {
      status: 'COMPLETE',
      weight: 20,
      verifiedCompletion: 100,
      contribution: 20,
      actualDate: '2026-03-28',
      baselineDate: '2026-03-31',
      evidenceCount: 2,
    }),
    milestone(2, 'Vendor contract signed', {
      weight: 0,
      isCritical: true,
      overdueDays: 9,
      baselineDate: '2026-10-07',
      forecastDate: '2026-10-22',
    }),
    milestone(3, 'Technology development', {
      weight: 40,
      verifiedCompletion: 85,
      contribution: 34,
      forecastDate: '2026-10-31',
      tasks: [
        {
          id: id(401),
          title: 'API integration',
          status: 'IN_PROGRESS',
          assignee: person(204, 'Ada Nwosu', 'Lead Engineer'),
          dueDate: '2026-10-25',
          completedAt: null,
        },
      ],
    }),
    milestone(4, 'Testing and deployment', {
      weight: 25,
      verifiedCompletion: 44,
      contribution: 11,
      baselineDate: '2026-11-30',
    }),
    milestone(5, 'Commercial launch', {
      weight: 15,
      status: 'NOT_STARTED',
      baselineDate: '2026-12-31',
    }),
  ],
  risks: [
    {
      id: id(501),
      type: 'ISSUE',
      title: 'Core banking API not ready for integration testing',
      severity: 'CRITICAL',
      status: 'OPEN',
      owner: person(205, 'Bola Ade', 'Head, Architecture'),
      dueDate: null,
      escalationLevel: 3,
    },
    {
      id: id(502),
      type: 'RISK',
      title: 'SEC product approval may slip past launch date',
      severity: 'HIGH',
      status: 'OPEN',
      owner: person(206, 'Kemi Oke', 'Head, Compliance'),
      dueDate: '2026-10-30',
      escalationLevel: null,
    },
  ],
  dependencies: {
    blockedBy: [
      {
        id: id(801),
        initiativeId: id(11),
        code: 'DIG-011',
        title: 'Core Banking API Layer',
        status: 'BLOCKED',
        blockedSince: '2026-09-25',
        isCriticalPath: true,
        description: 'Account API needed for onboarding',
        neededBy: '2026-10-20',
      },
    ],
    enables: [
      {
        id: id(802),
        initiativeId: id(5),
        code: 'REV-005',
        title: 'Bancassurance Product Bundle',
        status: 'ON_TRACK',
        blockedSince: null,
        isCriticalPath: false,
        description: null,
        neededBy: null,
      },
    ],
  },
  kpis: [{ id: id(601), code: 'K05', name: 'Digital transaction share' }],
  progressHistory: [
    { asOf: '2026-03-31', planned: 5, verified: 4 },
    { asOf: '2026-06-30', planned: 30, verified: 27 },
    { asOf: '2026-09-30', planned: 66, verified: 60 },
  ],
  activity: [
    {
      action: 'HEALTH_OVERRIDDEN',
      summary: 'Status overridden Red → Amber with reason',
      at: '2026-10-13T09:00:00.000Z',
      actor: person(202, 'Tunde Bakare', 'ED, Business'),
    },
    {
      action: 'UPDATE_SUBMITTED',
      summary: 'October update submitted: 65%',
      at: '2026-10-11T08:00:00.000Z',
      actor: person(201, 'Hassan Danjuma', 'Head, Digital Business'),
    },
  ],
  can: {
    changeStatus: ['ON_HOLD', 'CLOSED', 'CANCELLED'],
    override: true,
    edit: true,
    requestChange: true,
    editFields: [
      'title',
      'description',
      'businessCase',
      'scope',
      'ownerId',
      'sponsorId',
      'benefitsOwnerId',
      'departmentId',
      'priority',
      'isSensitive',
      'forecastEnd',
      'spentToDate',
    ],
    changeObjectives: true,
    planMilestones: false,
    manageWork: true,
  },
};

export const CHANGE_REQUESTS: ChangeRequestView[] = [
  {
    id: id(701),
    reference: 'CR-0139',
    type: 'BUDGET_CHANGE',
    status: 'PENDING',
    initiative: { id: DIG_004_ID, code: 'DIG-004', title: DIG_004.title },
    changes: { baselineBudget: 550_000_000 },
    before: { baselineBudget: 500_000_000 },
    justification: 'Release contingency for the vendor.',
    requestedBy: person(201, 'Hassan Danjuma', 'Head, Digital Business'),
    approver: null,
    decisionId: id(702),
    decisionReason: null,
    decidedAt: null,
    createdAt: '2026-10-12T09:00:00.000Z',
  },
];
