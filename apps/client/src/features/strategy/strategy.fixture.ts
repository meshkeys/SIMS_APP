import type { ElementDetail, MapElement, StrategyMap } from '@sims/contracts';

const id = (n: number) =>
  `0192a1b2-c3d4-7e5f-8a9b-${String(n).padStart(12, '0')}`;
export const IDS = {
  plan: id(1),
  pillarLevel: id(2),
  objectiveLevel: id(3),
  revenue: id(10),
  digital: id(11),
  o11: id(20),
  o12: id(21),
  o21: id(22),
};

const element = (
  over: Partial<MapElement> & Pick<MapElement, 'id' | 'code' | 'title'>,
): MapElement => ({
  parentId: null,
  levelId: IDS.pillarLevel,
  // Depth counts from 1 (the top level), as the API sends it.
  depth: 1,
  sortOrder: 0,
  owner: null,
  sponsor: null,
  executionScore: null,
  impactScore: null,
  health: 'UNKNOWN',
  kpiCount: 0,
  headlineKpi: null,
  initiatives: {
    total: 0,
    byHealth: { GREEN: 0, AMBER: 0, RED: 0, UNKNOWN: 0 },
  },
  ...over,
});

const objective = (
  over: Partial<MapElement> &
    Pick<MapElement, 'id' | 'code' | 'title' | 'parentId'>,
) => element({ levelId: IDS.objectiveLevel, depth: 2, ...over });

export const MAP: StrategyMap = {
  plan: {
    id: IDS.plan,
    name: 'FY2024–2026 Strategic Plan',
    status: 'APPROVED',
    version: 3,
    startDate: '2024-01-01',
    endDate: '2026-12-31',
    approvedAt: '2026-01-12T10:00:00.000Z',
    vision: 'To be the most trusted financial partner',
    mission: null,
    values: [],
    aspiration:
      'Become the most trusted diversified financial services group by 2026.',
  },
  levels: [
    {
      id: IDS.pillarLevel,
      depth: 1,
      label: 'Pillar',
      pluralLabel: 'Pillars',
      codePrefix: 'P',
      allowsKpis: false,
      elementCount: 2,
    },
    {
      id: IDS.objectiveLevel,
      depth: 2,
      label: 'Objective',
      pluralLabel: 'Objectives',
      codePrefix: 'O',
      allowsKpis: true,
      elementCount: 3,
    },
  ],
  totals: { kpis: 18, activeInitiatives: 32 },
  elements: [
    element({
      id: IDS.revenue,
      code: 'P1',
      title: 'Revenue Diversification',
      sponsor: {
        membershipId: id(90),
        name: 'Tunde Bakare',
        jobTitle: 'ED, Business',
      },
      executionScore: 95.91,
      health: 'GREEN',
    }),
    element({
      id: IDS.digital,
      code: 'P2',
      title: 'Digital Transformation',
      sortOrder: 1,
      executionScore: 79.58,
      health: 'AMBER',
    }),
    objective({
      id: IDS.o11,
      parentId: IDS.revenue,
      code: 'O1.1',
      title: 'Grow non-interest income share',
      health: 'GREEN',
      headlineKpi: {
        name: 'Non-interest income',
        unit: '%',
        baseline: 18,
        target: 30,
      },
      initiatives: {
        total: 4,
        byHealth: { GREEN: 3, AMBER: 1, RED: 0, UNKNOWN: 0 },
      },
    }),
    objective({
      id: IDS.o12,
      parentId: IDS.revenue,
      code: 'O1.2',
      title: 'Build the institutional client base',
      sortOrder: 1,
      health: 'GREEN',
      headlineKpi: {
        name: 'Institutional clients',
        unit: 'clients',
        baseline: 40,
        target: 120,
      },
      initiatives: {
        total: 4,
        byHealth: { GREEN: 4, AMBER: 0, RED: 0, UNKNOWN: 0 },
      },
    }),
    objective({
      id: IDS.o21,
      parentId: IDS.digital,
      code: 'O2.1',
      title: 'Shift transactions to digital channels',
      health: 'RED',
      initiatives: {
        total: 5,
        byHealth: { GREEN: 2, AMBER: 1, RED: 2, UNKNOWN: 0 },
      },
    }),
  ],
};

export const O11_DETAIL: ElementDetail = {
  id: IDS.o11,
  planId: IDS.plan,
  code: 'O1.1',
  title: 'Grow non-interest income share',
  description: null,
  depth: 2,
  level: { id: IDS.objectiveLevel, label: 'Objective' },
  breadcrumb: [
    {
      id: IDS.revenue,
      code: 'P1',
      title: 'Revenue Diversification',
      levelLabel: 'Pillar',
    },
  ],
  owner: {
    membershipId: id(91),
    name: 'Kemi Ade',
    jobTitle: 'Head, Business Development',
  },
  sponsor: null,
  executionScore: 94.34,
  impactScore: 49.4,
  health: 'GREEN',
  kpis: [
    {
      id: id(30),
      code: 'K01',
      name: 'Non-interest income share',
      unit: '%',
      direction: 'HIGHER_IS_BETTER',
      frequency: 'MONTHLY',
      baseline: 18,
      baselineDate: '2024-01-01',
      planTarget: 30,
      rangeLow: null,
      rangeHigh: null,
      targets: [
        { id: id(31), label: 'FY2026', targetDate: '2026-12-31', value: 30 },
      ],
      currentTarget: {
        id: id(31),
        label: 'FY2026',
        targetDate: '2026-12-31',
        value: 30,
      },
      latestValue: 23,
      latestAt: '2026-09-30',
      trajectory: 'SLIGHTLY_BEHIND',
      progressToTarget: 41.7,
    },
  ],
  contributors: [
    {
      initiativeId: id(40),
      code: 'REV-001',
      title: 'Expand Institutional Partnerships',
      status: 'ACTIVE',
      health: 'GREEN',
      verifiedProgress: 80,
      contributionWeight: 50,
      isPrimary: true,
    },
    {
      initiativeId: id(41),
      code: 'DIG-004',
      title: 'Launch Digital Investment Platform',
      status: 'ACTIVE',
      health: 'AMBER',
      verifiedProgress: 65,
      contributionWeight: 30,
      isPrimary: false,
    },
  ],
  hiddenContributors: 1,
  children: [],
};
