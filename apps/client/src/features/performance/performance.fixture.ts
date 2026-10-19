import type {
  KpiActualRow,
  KpiActualsSheet,
  Performance,
  PeriodSummary,
  ScorecardRow,
} from '@sims/contracts';
import { SESSION } from '@/test/fake-api';

const M = 1_000_000;
const id = (n: number) =>
  `0192a1b2-c3d4-7e5f-8a9b-${String(n).padStart(12, '0')}`;

export const PERIOD_ID = id(700);
export const LOCKED_PERIOD_ID = id(701);
export const K01 = id(801);
export const K05 = id(805);
export const K13 = id(813);

const P1 = { id: id(901), code: 'P1', title: 'Revenue Diversification' };
const P2 = { id: id(902), code: 'P2', title: 'Digital Transformation' };
const P4 = { id: id(904), code: 'P4', title: 'Customer Experience' };

const trend = (values: number[]) =>
  values.map((value, i) => ({
    period:
      ['April', 'May', 'June', 'July', 'August', 'September'][i]! + ' 2026',
    periodEnd: `2026-${String(4 + i).padStart(2, '0')}-28`,
    value,
  }));

const scorecardRow = (
  kpiId: string,
  code: string,
  name: string,
  topLevel: typeof P1,
  unit: string,
  [baseline, target, latest]: [number, number, number],
  trajectory: ScorecardRow['trajectory'],
): ScorecardRow => ({
  id: kpiId,
  code,
  name,
  unit,
  direction: 'HIGHER_IS_BETTER',
  topLevel,
  baseline,
  target,
  targetLabel: 'FY2026',
  latestValue: latest,
  latestAt: '2026-09-30',
  trajectory,
  trend: trend([
    latest - 2.5,
    latest - 2,
    latest - 1.5,
    latest - 1,
    latest - 0.5,
    latest,
  ]),
});

export const PERFORMANCE: Performance = {
  plan: { id: id(600), name: 'Strategic Plan 2024–2026' },
  year: 2026,
  years: [2024, 2025, 2026],
  asAt: '2026-10-16',
  currency: 'NGN',
  benefits: {
    expected: 4200 * M,
    expectedToDate: 2700 * M,
    realisedToDate: 1900 * M,
    realisedPctOfExpected: 70,
    quarters: [
      {
        label: 'Q1',
        periodEnd: '2026-03-31',
        expected: 600 * M,
        realised: 520 * M,
        forecast: null,
        complete: true,
        captureRate: 87,
      },
      {
        label: 'Q2',
        periodEnd: '2026-06-30',
        expected: 900 * M,
        realised: 700 * M,
        forecast: null,
        complete: true,
        captureRate: 78,
      },
      {
        label: 'Q3',
        periodEnd: '2026-09-30',
        expected: 1200 * M,
        realised: 680 * M,
        forecast: null,
        complete: true,
        captureRate: 57,
      },
      {
        label: 'Q4',
        periodEnd: '2026-12-31',
        expected: 1500 * M,
        realised: null,
        forecast: 900 * M,
        complete: false,
        captureRate: null,
      },
    ],
  },
  kpis: {
    total: 18,
    onTrajectory: 9,
    slightlyBehind: 5,
    offTrajectory: 4,
    notMeasurable: 0,
  },
  lowValue: {
    thresholdPct: 50,
    count: 3,
    items: [
      {
        initiativeId: id(501),
        code: 'DIG-011',
        title: 'Self-service Kiosks',
        status: 'ACTIVE',
        health: 'GREEN',
        delivery: 92,
        impactScore: 20,
        impactSummary: 'Usage 20% of target',
      },
      {
        initiativeId: id(502),
        code: 'DIG-020',
        title: 'Mobile App Relaunch',
        status: 'CLOSED',
        health: 'GREEN',
        delivery: 100,
        impactScore: 35,
        impactSummary: 'Active users 35% of target',
      },
      {
        initiativeId: id(503),
        code: 'REV-010',
        title: 'Agent Banking Rollout',
        status: 'CLOSED',
        health: 'GREEN',
        delivery: 100,
        impactScore: 40,
        impactSummary: null,
      },
    ],
  },
  scorecard: [
    scorecardRow(
      K01,
      'K01',
      'Non-interest income share',
      P1,
      '%',
      [18, 30, 23],
      'SLIGHTLY_BEHIND',
    ),
    scorecardRow(
      K05,
      'K05',
      'Digital transaction share',
      P2,
      '%',
      [45, 75, 58],
      'SLIGHTLY_BEHIND',
    ),
    scorecardRow(
      K13,
      'K13',
      'Net Promoter Score',
      P4,
      'score',
      [22, 45, 27],
      'OFF_TRAJECTORY',
    ),
  ],
  can: { recordKpiActuals: true },
};

export const PERIODS: PeriodSummary[] = [
  {
    id: PERIOD_ID,
    name: 'October 2026',
    status: 'OWNER_SUBMISSION',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    deadlines: {
      submissionOpensAt: null,
      submissionDueAt: '2026-10-10T16:00:00.000Z',
      strategyReviewDueAt: null,
      sponsorReviewDueAt: null,
      reportIssueDueAt: null,
    },
    lockedAt: null,
    cycleDay: { day: 2, of: 8 },
    counts: {
      owed: 2,
      in: 0,
      outstanding: 2,
      drafts: 0,
      awaitingVerification: 0,
      challenged: 0,
      awaitingSponsor: 0,
      approved: 0,
    },
  },
  {
    id: LOCKED_PERIOD_ID,
    name: 'September 2026',
    status: 'LOCKED',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    deadlines: {
      submissionOpensAt: null,
      submissionDueAt: null,
      strategyReviewDueAt: null,
      sponsorReviewDueAt: null,
      reportIssueDueAt: null,
    },
    lockedAt: '2026-10-08T11:00:00.000Z',
    cycleDay: null,
    counts: {
      owed: 2,
      in: 2,
      outstanding: 0,
      drafts: 0,
      awaitingVerification: 0,
      challenged: 0,
      awaitingSponsor: 0,
      approved: 2,
    },
  },
];

const HASSAN = {
  membershipId: id(950),
  name: 'Hassan Danjuma',
  jobTitle: 'Head, Digital Business',
};
const OFFICE = {
  membershipId: SESSION.session.membership.id,
  name: 'Amara Bello',
  jobTitle: 'Head, Strategy Office',
};

const sheetRow = (
  kpiId: string,
  code: string,
  name: string,
  topLevel: typeof P1,
  unit: string,
  owner: typeof HASSAN,
  [previous, target]: [number, number],
  actual: KpiActualRow['actual'],
  can: KpiActualRow['can'],
): KpiActualRow => ({
  kpi: { id: kpiId, code, name, unit, direction: 'HIGHER_IS_BETTER' },
  topLevel,
  owner,
  baseline: null,
  target,
  targetLabel: 'FY2026',
  previous: { period: 'September 2026', value: previous },
  actual,
  can,
});

/** October as the Strategy Office sees it: K05 entered by Hassan, waiting. */
export const SHEET: KpiActualsSheet = {
  period: {
    id: PERIOD_ID,
    name: 'October 2026',
    endDate: '2026-10-31',
    status: 'OWNER_SUBMISSION',
  },
  rows: [
    sheetRow(
      K01,
      'K01',
      'Non-interest income share',
      P1,
      '%',
      OFFICE,
      [23, 30],
      null,
      {
        record: true,
        verify: false,
      },
    ),
    sheetRow(
      K05,
      'K05',
      'Digital transaction share',
      P2,
      '%',
      HASSAN,
      [58, 75],
      {
        value: 66,
        commentary: 'Card tokenisation went live',
        verified: false,
        recordedBy: HASSAN,
        verifiedBy: null,
      },
      { record: true, verify: true },
    ),
    sheetRow(
      K13,
      'K13',
      'Net Promoter Score',
      P4,
      'score',
      OFFICE,
      [27, 45],
      null,
      {
        record: true,
        verify: false,
      },
    ),
  ],
  counts: { kpis: 3, recorded: 1, verified: 0 },
  open: true,
};

export { HASSAN };
