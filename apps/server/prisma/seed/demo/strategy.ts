import type {
  KpiDirection,
  Trajectory,
} from '../../../src/generated/prisma/enums.js';
import type { PersonKey } from './people.js';

export const PLAN = {
  name: 'FY2024–2026 Strategic Plan',
  startDate: '2024-01-01',
  endDate: '2026-12-31',
  version: 3,
  approvedAt: '2026-01-12',
  vision:
    'To be the most trusted diversified financial services group in West Africa.',
  mission:
    'We help individuals, businesses and institutions grow wealth through simple, secure and personal financial services.',
  values: ['Integrity', 'Customer first', 'Excellence', 'Accountability'],
  aspiration:
    'Become the most trusted diversified financial services group by 2026.',
} as const;

/**
 * The organisation's own framework: two strategy levels. Other organisations
 * configure different levels (perspectives, goals, outcomes…) and any number
 * of elements per level — nothing below assumes "5 pillars".
 */
export const LEVELS = [
  {
    depth: 1,
    label: 'Strategic pillar',
    pluralLabel: 'Strategic pillars',
    codePrefix: 'P',
    allowsKpis: false,
  },
  {
    depth: 2,
    label: 'Strategic objective',
    pluralLabel: 'Strategic objectives',
    codePrefix: 'O',
    allowsKpis: true,
  },
] as const;

export interface PillarSpec {
  code: string;
  title: string;
  sponsor: PersonKey;
}

export interface ObjectiveSpec {
  code: string;
  pillar: string;
  title: string;
  owner: PersonKey;
}

export interface KpiSpec {
  code: string;
  objective: string;
  name: string;
  unit: string;
  direction: KpiDirection;
  baseline: number;
  target: number;
  latest: number;
  trajectory: Trajectory;
}

export const PILLARS: PillarSpec[] = [
  {
    code: 'P1',
    title: 'Revenue Diversification',
    sponsor: 'edBusiness',
  },
  {
    code: 'P2',
    title: 'Digital Transformation',
    sponsor: 'edTech',
  },
  {
    code: 'P3',
    title: 'Operational Excellence',
    sponsor: 'coo',
  },
  {
    code: 'P4',
    title: 'Customer Experience',
    sponsor: 'edRetail',
  },
  {
    code: 'P5',
    title: 'People & Capabilities',
    sponsor: 'cpo',
  },
];

export const OBJECTIVES: ObjectiveSpec[] = [
  {
    code: 'O1.1',
    pillar: 'P1',
    title: 'Grow non-interest income share',
    owner: 'headBizDev',
  },
  {
    code: 'O1.2',
    pillar: 'P1',
    title: 'Build the institutional client base',
    owner: 'headBizDev',
  },
  {
    code: 'O2.1',
    pillar: 'P2',
    title: 'Shift transactions to digital channels',
    owner: 'headDigital',
  },
  {
    code: 'O2.2',
    pillar: 'P2',
    title: 'Modernise core platforms',
    owner: 'headTech',
  },
  {
    code: 'O3.1',
    pillar: 'P3',
    title: 'Reduce cost-to-income ratio',
    owner: 'headFinance',
  },
  {
    code: 'O3.2',
    pillar: 'P3',
    title: 'Cut process turnaround times',
    owner: 'headOps',
  },
  {
    code: 'O4.1',
    pillar: 'P4',
    title: 'Raise customer satisfaction',
    owner: 'headCX',
  },
  {
    code: 'O4.2',
    pillar: 'P4',
    title: 'Resolve complaints faster',
    owner: 'headService',
  },
  {
    code: 'O5.1',
    pillar: 'P5',
    title: 'Build a performance culture',
    owner: 'headHR',
  },
  {
    code: 'O5.2',
    pillar: 'P5',
    title: 'Develop digital skills',
    owner: 'headLearning',
  },
];

/** 18 KPIs: 9 on trajectory, 5 slightly behind, 4 off trajectory. */
export const KPIS: KpiSpec[] = [
  {
    code: 'K01',
    objective: 'O1.1',
    name: 'Non-interest income share',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    baseline: 18,
    target: 30,
    latest: 23,
    trajectory: 'SLIGHTLY_BEHIND',
  },
  {
    code: 'K02',
    objective: 'O1.1',
    name: 'Fee income growth (YoY)',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    baseline: 6,
    target: 20,
    latest: 12.5,
    trajectory: 'SLIGHTLY_BEHIND',
  },
  {
    code: 'K03',
    objective: 'O1.2',
    name: 'Active institutional clients',
    unit: 'clients',
    direction: 'HIGHER_IS_BETTER',
    baseline: 40,
    target: 120,
    latest: 86,
    trajectory: 'ON_TRAJECTORY',
  },
  {
    code: 'K04',
    objective: 'O1.2',
    name: 'Institutional assets under management',
    unit: 'NGN bn',
    direction: 'HIGHER_IS_BETTER',
    baseline: 120,
    target: 300,
    latest: 214,
    trajectory: 'ON_TRAJECTORY',
  },
  {
    code: 'K05',
    objective: 'O2.1',
    name: 'Digital transaction share',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    baseline: 45,
    target: 75,
    latest: 58,
    trajectory: 'SLIGHTLY_BEHIND',
  },
  {
    code: 'K06',
    objective: 'O2.1',
    name: 'Monthly active mobile users',
    unit: 'm users',
    direction: 'HIGHER_IS_BETTER',
    baseline: 1.2,
    target: 3,
    latest: 1.6,
    trajectory: 'OFF_TRAJECTORY',
  },
  {
    code: 'K07',
    objective: 'O2.2',
    name: 'Workloads on cloud',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    baseline: 10,
    target: 60,
    latest: 24,
    trajectory: 'OFF_TRAJECTORY',
  },
  {
    code: 'K08',
    objective: 'O2.2',
    name: 'Core system availability',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    baseline: 99,
    target: 99.9,
    latest: 99.7,
    trajectory: 'ON_TRAJECTORY',
  },
  {
    code: 'K09',
    objective: 'O3.1',
    name: 'Cost-to-income ratio',
    unit: '%',
    direction: 'LOWER_IS_BETTER',
    baseline: 68,
    target: 58,
    latest: 61,
    trajectory: 'ON_TRAJECTORY',
  },
  {
    code: 'K10',
    objective: 'O3.1',
    name: 'Procurement savings',
    unit: 'NGN m',
    direction: 'HIGHER_IS_BETTER',
    baseline: 0,
    target: 2500,
    latest: 1900,
    trajectory: 'ON_TRAJECTORY',
  },
  {
    code: 'K11',
    objective: 'O3.2',
    name: 'Account opening turnaround',
    unit: 'days',
    direction: 'LOWER_IS_BETTER',
    baseline: 5,
    target: 1,
    latest: 3.2,
    trajectory: 'SLIGHTLY_BEHIND',
  },
  {
    code: 'K12',
    objective: 'O3.2',
    name: 'Loan approval turnaround',
    unit: 'days',
    direction: 'LOWER_IS_BETTER',
    baseline: 10,
    target: 3,
    latest: 4.5,
    trajectory: 'ON_TRAJECTORY',
  },
  {
    code: 'K13',
    objective: 'O4.1',
    name: 'Net Promoter Score',
    unit: 'score',
    direction: 'HIGHER_IS_BETTER',
    baseline: 22,
    target: 45,
    latest: 27,
    trajectory: 'OFF_TRAJECTORY',
  },
  {
    code: 'K14',
    objective: 'O4.1',
    name: 'Customer satisfaction index',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    baseline: 70,
    target: 85,
    latest: 81,
    trajectory: 'ON_TRAJECTORY',
  },
  {
    code: 'K15',
    objective: 'O4.2',
    name: 'Complaint resolution time',
    unit: 'h',
    direction: 'LOWER_IS_BETTER',
    baseline: 72,
    target: 24,
    latest: 60,
    trajectory: 'OFF_TRAJECTORY',
  },
  {
    code: 'K16',
    objective: 'O5.1',
    name: 'Staff on balanced scorecards',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    baseline: 0,
    target: 100,
    latest: 90,
    trajectory: 'ON_TRAJECTORY',
  },
  {
    code: 'K17',
    objective: 'O5.2',
    name: 'Digitally certified staff',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    baseline: 5,
    target: 40,
    latest: 21,
    trajectory: 'SLIGHTLY_BEHIND',
  },
  {
    code: 'K18',
    objective: 'O5.2',
    name: 'Training hours per employee',
    unit: 'hours',
    direction: 'HIGHER_IS_BETTER',
    baseline: 12,
    target: 40,
    latest: 33,
    trajectory: 'ON_TRAJECTORY',
  },
];

/** Monthly KPI actuals are recorded for these periods (the "6-month trend"). */
export const KPI_ACTUAL_MONTHS = [
  'April 2026',
  'May 2026',
  'June 2026',
  'July 2026',
  'August 2026',
  'September 2026',
] as const;
