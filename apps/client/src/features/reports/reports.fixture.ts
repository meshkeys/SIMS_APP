import type {
  PackContent,
  PackInitiativeRow,
  PackSection,
  ReportPack,
  ReportSnapshot,
} from '@sims/contracts';

const id = (n: number) =>
  `0192a1b2-c3d4-7e5f-8a9b-${String(n).padStart(12, '0')}`;

export const SEPTEMBER = id(801);
const AUGUST = id(802);
export const P2 = id(902);

export const SNAPSHOTS: ReportSnapshot[] = [
  {
    id: SEPTEMBER,
    periodId: id(701),
    period: 'September 2026',
    periodEnd: '2026-09-30',
    quarter: 'Q3 2026',
    lockedAt: '2026-10-08T11:00:00.000Z',
    usable: true,
    pillars: [
      { id: id(901), code: 'P1', title: 'Revenue Diversification' },
      { id: P2, code: 'P2', title: 'Digital Transformation' },
    ],
  },
  {
    id: AUGUST,
    periodId: id(702),
    period: 'August 2026',
    periodEnd: '2026-08-31',
    quarter: null,
    lockedAt: '2026-09-08T11:00:00.000Z',
    usable: true,
    pillars: [],
  },
  {
    id: id(803),
    periodId: id(703),
    period: 'January 2026',
    periodEnd: '2026-01-31',
    quarter: null,
    lockedAt: '2026-02-08T11:00:00.000Z',
    usable: false,
    pillars: [],
  },
];

const row = (
  n: number,
  health: PackInitiativeRow['health'],
): PackInitiativeRow => ({
  code: `DIG-${String(n).padStart(3, '0')}`,
  title: `Initiative ${n}`,
  pillar: 'Digital Transformation',
  owner: 'Head, Technology',
  health,
  verifiedProgress: 50,
  plannedProgress: 60,
  gapPp: -10,
  impactScore: null,
  impactSummary: null,
});

/** Every section of a template, as the server assembles it for the September snapshot. */
const SECTIONS: Record<string, PackSection> = {
  executive_summary: {
    key: 'executive_summary',
    title: 'Executive summary & headline numbers',
    pages: 1,
    narrative: null,
    headline: {
      initiatives: 32,
      onTrack: 21,
      atRisk: 7,
      delayed: 4,
      unknown: 0,
      kpisOnTrajectory: 9,
      kpisTotal: 18,
      benefitsRealised: 1_900_000_000,
      benefitsRealisedPct: 70,
      openEscalations: 16,
      decisionsPending: 3,
    },
  },
  pillar_performance: {
    key: 'pillar_performance',
    title: 'Pillar performance: execution vs impact',
    pages: 1,
    pillars: [
      {
        code: 'P2',
        title: 'Digital Transformation',
        health: 'AMBER',
        executionScore: 80,
        impactScore: 43,
        initiatives: 9,
        atRisk: 3,
        delayed: 2,
      },
    ],
  },
  delivery_vs_value: {
    key: 'delivery_vs_value',
    title: 'Delivery vs value matrix',
    pages: 1,
    thresholdPct: 50,
    quadrants: {
      ON_PLAN_VALUE_OK: ['DIG-001'],
      ON_PLAN_VALUE_LOW: ['DIG-011'],
      BEHIND_VALUE_OK: [],
      BEHIND_VALUE_LOW: ['DIG-004'],
      NOT_MEASURABLE: [],
    },
  },
  exceptions: {
    key: 'exceptions',
    title: 'Delayed & at-risk initiatives',
    pages: 2,
    initiatives: Array.from({ length: 10 }, (_, i) =>
      row(i + 1, i < 4 ? 'RED' : 'AMBER'),
    ),
  },
  decisions: {
    key: 'decisions',
    title: 'Decisions required from the Board',
    pages: 1,
    decisions: [
      {
        reference: 'GOV-0031',
        title: 'Approve core banking budget',
        requiredFrom: 'BOARD',
        initiative: 'DIG-011',
        dueDate: '2026-10-20',
      },
    ],
  },
  benefits: {
    key: 'benefits',
    title: 'Benefits realisation',
    pages: 1,
    currency: 'NGN',
    year: 2026,
    expected: 4_200_000_000,
    expectedToDate: 2_700_000_000,
    realisedToDate: 1_900_000_000,
    realisedPctOfExpected: 70,
    quarters: [
      {
        label: 'Q1',
        expected: 600_000_000,
        realised: 520_000_000,
        forecast: null,
      },
      {
        label: 'Q4',
        expected: 1_500_000_000,
        realised: null,
        forecast: 900_000_000,
      },
    ],
  },
  register: {
    key: 'register',
    title: 'Full initiative register (appendix)',
    pages: 2,
    initiatives: Array.from({ length: 30 }, (_, i) => row(i + 1, 'GREEN')),
  },
};

/** What the server returns for a preview request (it is asked for every offered section). */
export function previewFor(body: {
  template: PackContent['template'];
  audience: PackContent['audience'];
  sections: string[];
}): PackContent {
  const sections = body.sections
    .map((key) => SECTIONS[key])
    .filter((s): s is PackSection => !!s)
    .map((s) =>
      s.key === 'decisions' && body.audience === 'EXCO'
        ? { ...s, title: 'Decisions required' }
        : s,
    );
  return {
    title:
      body.template === 'QUARTERLY_BOARD'
        ? 'Q3 2026 Board pack'
        : 'September 2026 management report',
    template: body.template,
    audience: body.audience,
    period: 'September 2026',
    lockedAt: '2026-10-08T11:00:00.000Z',
    organisation: 'Meridian Financial Group',
    pageCount: 1 + sections.reduce((n, s) => n + s.pages, 0),
    sensitiveSummarised: body.audience === 'BOARD' ? 2 : 0,
    sections,
  };
}

const pack = (n: number, over: Partial<ReportPack>): ReportPack => ({
  id: id(600 + n),
  title: 'Q2 2026 Board pack',
  template: 'QUARTERLY_BOARD',
  audience: 'BOARD',
  period: 'June 2026',
  snapshotId: id(804),
  sections: ['executive_summary'],
  formats: ['PDF', 'PPTX'],
  narrative: null,
  status: 'READY',
  version: '1.1',
  available: ['PDF', 'PPTX'],
  requestedBy: null,
  requestedAt: '2026-07-21T09:00:00.000Z',
  issuedAt: '2026-07-22T09:00:00.000Z',
  error: null,
  ...over,
});

export const PACKS: ReportPack[] = [
  pack(3, {
    title: 'August management report',
    audience: 'EXCO',
    template: 'MONTHLY_MANAGEMENT',
    formats: ['PDF'],
    status: 'FAILED',
    available: [],
    issuedAt: null,
    version: '1.0',
    error: 'PDF packs need Chrome or Chromium on the server.',
  }),
  pack(2, {}),
];
export const Q2_PACK = PACKS[1]!;
export const FAILED_PACK = PACKS[0]!;
