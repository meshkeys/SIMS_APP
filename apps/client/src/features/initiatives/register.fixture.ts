import type { RegisterItem, RegisterPage } from '@sims/contracts';

const id = (n: number) =>
  `0192a1b2-c3d4-7e5f-8a9b-${String(n).padStart(12, '0')}`;

const item = (
  n: number,
  code: string,
  title: string,
  over: Partial<RegisterItem> = {},
): RegisterItem => ({
  id: id(n),
  code,
  title,
  status: 'ACTIVE',
  priority: 2,
  isSensitive: false,
  pillar: { id: id(900), code: 'P2', title: 'Digital Transformation' },
  owner: {
    membershipId: id(800 + n),
    name: `Owner ${n}`,
    jobTitle: 'Head, Technology',
  },
  sponsor: {
    membershipId: id(700),
    name: 'Sponsor',
    jobTitle: 'ED, Technology',
  },
  department: null,
  dueDate: '2026-10-15',
  forecastEnd: null,
  verifiedProgress: 40,
  plannedProgress: 100,
  variancePp: -60,
  health: 'RED',
  calculatedHealth: 'RED',
  overridden: false,
  impactScore: null,
  impactSummary: null,
  trajectory: 'ON_TRAJECTORY',
  lastUpdateAt: '2026-10-02T09:00:00.000Z',
  updateOverdue: {
    periodName: 'October 2026',
    detail: 'October 2026 update overdue by 2 days',
  },
  ...over,
});

export const ITEMS: RegisterItem[] = [
  item(1, 'DIG-007', 'Automate Customer Onboarding', {
    pillar: { id: id(901), code: 'P3', title: 'Operational Excellence' },
  }),
  item(2, 'DIG-004', 'Launch Digital Investment Platform', {
    health: 'AMBER',
    calculatedHealth: 'AMBER',
    verifiedProgress: 65,
    plannedProgress: 74,
    variancePp: -9,
    impactSummary: 'Pilot revenue 10% of target',
    updateOverdue: null,
    lastUpdateAt: '2026-10-11T08:00:00.000Z',
  }),
  item(3, 'REV-002', 'Expand Institutional Partnerships', {
    health: 'GREEN',
    calculatedHealth: 'GREEN',
    verifiedProgress: 80,
    plannedProgress: 78,
    variancePp: 2,
    impactScore: 72,
    updateOverdue: null,
    isSensitive: true,
  }),
];

export const page = (
  items: RegisterItem[] = ITEMS,
  over: Partial<RegisterPage> = {},
): RegisterPage => ({
  items,
  page: 1,
  pageSize: 10,
  total: 32,
  totalPages: 4,
  tabCounts: { active: 32, pipeline: 5, closed: 6, cancelled: 2 },
  healthCounts: { GREEN: 21, AMBER: 7, RED: 4, UNKNOWN: 0 },
  ...over,
});
