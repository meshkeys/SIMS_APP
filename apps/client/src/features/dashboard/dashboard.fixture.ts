import type {
  Dashboard,
  DecisionView,
  RegisterItem,
  StrategyMap,
} from '@sims/contracts';

/** Test data shaped like the Meridian demo, typed by the contract. */

const id = (n: number) =>
  `0192a1b2-c3d4-7e5f-8a9b-${String(n).padStart(12, '0')}`;
export const PILLAR_IDS = { revenue: id(101), digital: id(102) };

const person = (n: number, name: string, jobTitle: string) => ({
  membershipId: id(n),
  name,
  jobTitle,
});

const watch = (
  n: number,
  title: string,
  health: RegisterItem['health'],
  verified: number,
  planned: number,
): RegisterItem => ({
  id: id(n),
  code: `DIG-00${n}`,
  title,
  status: 'ACTIVE',
  priority: 1,
  isSensitive: false,
  pillar: {
    id: PILLAR_IDS.digital,
    code: 'P2',
    title: 'Digital Transformation',
  },
  owner: person(200 + n, 'Hassan Bello', 'Head, Digital Business'),
  sponsor: null,
  department: null,
  dueDate: '2026-12-31',
  forecastEnd: null,
  verifiedProgress: verified,
  plannedProgress: planned,
  variancePp: verified - planned,
  health,
  calculatedHealth: health,
  overridden: false,
  impactScore: 40,
  impactSummary: null,
  trajectory: 'ON_TRAJECTORY',
  lastUpdateAt: null,
  updateOverdue: null,
});

export const decision = (
  overrides: Partial<DecisionView> = {},
): DecisionView => ({
  id: id(301),
  reference: 'CR-0142',
  title: 'Approve 6-week baseline extension for Automate Customer Onboarding',
  context: null,
  kind: 'CHANGE_REQUEST',
  initiative: {
    id: id(1),
    code: 'DIG-001',
    title: 'Automate Customer Onboarding',
  },
  requiredFrom: 'CEO',
  decisionOwner: null,
  dueDate: '2026-10-18',
  overdueDays: 0,
  outcome: 'PENDING',
  outcomeNotes: null,
  deferredUntil: null,
  decidedBy: null,
  decidedAt: null,
  changeRequestId: id(302),
  canDecide: true,
  ...overrides,
});

const cell = (count: number) => ({ count, items: [] });

export const DASHBOARD: Dashboard = {
  plan: {
    id: id(1000),
    name: 'FY2024–2026 Strategic Plan',
    startDate: '2024-01-01',
    endDate: '2026-12-31',
  },
  asAt: '2026-10-16T09:00:00.000Z',
  scope: null,
  cycle: {
    id: id(500),
    name: 'October 2026',
    status: 'SPONSOR_REVIEW',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    deadlines: {
      submissionOpensAt: '2026-10-06T08:00:00.000Z',
      submissionDueAt: '2026-10-10T16:00:00.000Z',
      strategyReviewDueAt: '2026-10-14T16:00:00.000Z',
      sponsorReviewDueAt: '2026-10-17T16:00:00.000Z',
      reportIssueDueAt: '2026-10-22T16:00:00.000Z',
    },
    lockedAt: null,
    cycleDay: { day: 6, of: 8 },
    counts: {
      owed: 32,
      in: 29,
      outstanding: 3,
      drafts: 0,
      awaitingVerification: 0,
      challenged: 6,
      awaitingSponsor: 3,
      approved: 20,
    },
    stages: [
      {
        key: 'OWNER_SUBMISSION',
        dueAt: '2026-10-10T16:00:00.000Z',
        state: 'DONE',
      },
      {
        key: 'STRATEGY_REVIEW',
        dueAt: '2026-10-14T16:00:00.000Z',
        state: 'DONE',
      },
      {
        key: 'SPONSOR_REVIEW',
        dueAt: '2026-10-17T16:00:00.000Z',
        state: 'CURRENT',
      },
      {
        key: 'REPORT_ISSUE',
        dueAt: '2026-10-22T16:00:00.000Z',
        state: 'UPCOMING',
      },
    ],
  },
  tiles: {
    active: 32,
    onTrack: 21,
    atRisk: 7,
    delayed: 4,
    unknown: 0,
    updatesOutstanding: 3,
  },
  performance: [
    {
      id: PILLAR_IDS.revenue,
      code: 'P1',
      title: 'Revenue Diversification',
      health: 'GREEN',
      executionScore: 95.91,
      impactScore: 52.13,
      initiatives: 8,
      atRisk: 1,
      delayed: 1,
    },
    {
      id: PILLAR_IDS.digital,
      code: 'P2',
      title: 'Digital Transformation',
      health: 'AMBER',
      executionScore: 79.58,
      impactScore: null,
      initiatives: 9,
      atRisk: 3,
      delayed: 2,
    },
  ],
  matrix: {
    lowValueThresholdPct: 50,
    quadrants: {
      ON_PLAN_VALUE_OK: cell(14),
      ON_PLAN_VALUE_LOW: {
        count: 5,
        items: [
          {
            id: id(5),
            code: 'CX-002',
            title: 'Mobile App Relaunch',
            health: 'GREEN',
            impactScore: 35,
          },
        ],
      },
      BEHIND_VALUE_OK: cell(3),
      BEHIND_VALUE_LOW: cell(4),
      NOT_MEASURABLE: cell(6),
    },
  },
  watchlist: [
    watch(7, 'Core Banking Integration', 'RED', 40, 74),
    watch(4, 'Launch Digital Investment Platform', 'AMBER', 65, 74),
  ],
  decisions: {
    items: [
      decision(),
      decision({
        id: id(303),
        reference: 'GOV-031',
        title: 'Assign an accountable owner to Branch Network Rationalisation',
        kind: 'DECISION',
        requiredFrom: 'STRATEGY_OFFICE',
        dueDate: '2026-10-13',
        overdueDays: 3,
        changeRequestId: null,
        canDecide: false,
      }),
    ],
    total: 3,
  },
  escalations: {
    items: [
      {
        id: id(401),
        reference: 'ESC-0001',
        title: 'Core banking API dependency blocking onboarding go-live',
        severity: 'CRITICAL',
        level: 3,
        levelName: 'MD/CEO · EXCO',
        daysAtLevel: 21,
        ageDays: 21,
        initiative: {
          id: id(7),
          code: 'DIG-007',
          title: 'Core Banking Integration',
        },
        decisionFrom: null,
        decisionFromRole: 'CEO',
      },
    ],
    total: 16,
    byLevel: [
      { level: 1, name: 'Initiative owner', count: 9 },
      { level: 2, name: 'Executive sponsor', count: 5 },
      { level: 3, name: 'MD/CEO · EXCO', count: 2 },
      { level: 4, name: 'Board', count: 0 },
    ],
  },
  milestones: {
    items: [
      {
        id: id(601),
        title: 'Vendor contract signed',
        initiative: {
          id: id(4),
          code: 'DIG-004',
          title: 'Launch Digital Investment Platform',
        },
        dueDate: '2026-10-22',
        baselineDate: '2026-10-07',
        slipDays: 15,
        isCritical: true,
        status: 'IN_PROGRESS',
        verifiedCompletion: 60,
      },
    ],
    total: 10,
    overdue: 1,
  },
};

export const STRATEGY_MAP: StrategyMap = {
  plan: {
    id: id(1000),
    name: 'FY2024–2026 Strategic Plan',
    status: 'APPROVED',
    version: 3,
    startDate: '2024-01-01',
    endDate: '2026-12-31',
    approvedAt: null,
    vision: null,
    mission: null,
    values: [],
    aspiration: null,
  },
  levels: [
    {
      id: id(900),
      depth: 0,
      label: 'Pillar',
      pluralLabel: 'Pillars',
      codePrefix: 'P',
      allowsKpis: false,
      elementCount: 2,
    },
  ],
  totals: { kpis: 0, activeInitiatives: 32 },
  elements: DASHBOARD.performance.map((p, i) => ({
    id: p.id,
    parentId: null,
    levelId: id(900),
    depth: 0,
    code: p.code,
    title: p.title,
    sortOrder: i,
    owner: null,
    sponsor: null,
    executionScore: p.executionScore,
    impactScore: p.impactScore,
    health: p.health,
    kpiCount: 0,
    headlineKpi: null,
    initiatives: {
      total: p.initiatives,
      byHealth: { GREEN: 0, AMBER: 0, RED: 0, UNKNOWN: 0 },
    },
  })),
};
