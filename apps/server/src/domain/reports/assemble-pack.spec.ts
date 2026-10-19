import {
  assemblePack,
  defaultPackTitle,
  nextVersion,
  quarterOf,
} from './assemble-pack.js';
import type { SnapshotDataV2, SnapshotInitiative } from './snapshot-data.js';

const initiative = (
  code: string,
  health: SnapshotInitiative['health'],
  over: Partial<SnapshotInitiative> = {},
): SnapshotInitiative => ({
  initiativeId: `id-${code}`,
  code,
  title: `${code} title`,
  status: 'ACTIVE',
  isSensitive: false,
  homeElementId: 'o1',
  pillarId: 'p1',
  owner: 'Head, Digital',
  health,
  calculatedHealth: health,
  overridden: false,
  verifiedProgress: 50,
  plannedProgress: 50,
  impactScore: 60,
  impactSummary: null,
  ...over,
});

const DATA: SnapshotDataV2 = {
  version: 2,
  period: {
    id: 'sep',
    name: 'September 2026',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
  },
  lockedAt: '2026-10-08T11:00:00.000Z',
  plan: { name: 'Plan 2024–2026' },
  thresholds: { lowValueThresholdPct: 50 },
  totals: {
    initiatives: 4,
    byHealth: { GREEN: 1, AMBER: 1, RED: 2, UNKNOWN: 0 },
  },
  initiatives: [
    initiative('DIG-001', 'GREEN', { impactScore: 30 }),
    initiative('DIG-004', 'RED', { verifiedProgress: 65, plannedProgress: 74 }),
    initiative('DIG-009', 'AMBER'),
    initiative('OPS-002', 'RED', {
      isSensitive: true,
      pillarId: 'p2',
      homeElementId: 'o2',
      verifiedProgress: 20,
      plannedProgress: 60,
    }),
  ],
  elements: [
    {
      id: 'p1',
      parentId: null,
      code: 'P1',
      title: 'Digital',
      health: 'AMBER',
      executionScore: 88,
      impactScore: 45,
    },
    {
      id: 'o1',
      parentId: 'p1',
      code: 'O1.1',
      title: 'Channels',
      health: 'AMBER',
      executionScore: 88,
      impactScore: 45,
    },
    {
      id: 'p2',
      parentId: null,
      code: 'P2',
      title: 'Operations',
      health: 'RED',
      executionScore: 40,
      impactScore: 70,
    },
    {
      id: 'o2',
      parentId: 'p2',
      code: 'O2.1',
      title: 'Cost',
      health: 'RED',
      executionScore: 40,
      impactScore: 70,
    },
  ],
  kpis: [
    {
      code: 'K01',
      name: 'Digital share',
      unit: '%',
      elementId: 'o1',
      baseline: 45,
      target: 75,
      latestValue: 58,
      trajectory: 'SLIGHTLY_BEHIND',
    },
    {
      code: 'K02',
      name: 'Cost to income',
      unit: '%',
      elementId: 'o2',
      baseline: 68,
      target: 58,
      latestValue: 61,
      trajectory: 'ON_TRAJECTORY',
    },
  ],
  decisions: [
    {
      reference: 'DEC-0001',
      title: 'Approve vendor',
      requiredFrom: 'CEO',
      initiativeId: 'id-DIG-004',
      dueDate: '2026-10-20',
    },
    {
      reference: 'DEC-0002',
      title: 'Close branches',
      requiredFrom: 'BOARD',
      initiativeId: 'id-OPS-002',
      dueDate: null,
    },
    {
      reference: 'DEC-0003',
      title: 'Approve plan change',
      requiredFrom: 'BOARD',
      initiativeId: null,
      dueDate: null,
    },
  ],
  escalations: {
    byLevel: [
      { level: 1, name: 'Initiative owner', open: 3 },
      { level: 2, name: 'Executive sponsor', open: 2 },
    ],
  },
  benefits: {
    currency: 'NGN',
    year: 2026,
    expected: 4200,
    expectedToDate: 2700,
    realisedToDate: 1900,
    realisedPctOfExpected: 70,
    quarters: [{ label: 'Q1', expected: 600, realised: 520, forecast: null }],
  },
};

const ALL_BOARD = {
  template: 'QUARTERLY_BOARD' as const,
  audience: 'BOARD' as const,
  sections: [
    'benefits',
    'executive_summary',
    'pillar_performance',
    'delivery_vs_value',
    'exceptions',
    'decisions',
  ] as const,
  scopeElementId: null,
  narrative: 'Execution is on track overall.',
};
const context = { organisation: 'Meridian', title: 'Q3 2026 Board pack' };

describe('assemblePack', () => {
  it('prints sections in the template order with a cover page', () => {
    const pack = assemblePack(
      DATA,
      { ...ALL_BOARD, sections: [...ALL_BOARD.sections] },
      context,
    );

    expect(pack.sections.map((s) => s.key)).toEqual([
      'executive_summary',
      'pillar_performance',
      'delivery_vs_value',
      'exceptions',
      'decisions',
      'benefits',
    ]);
    expect(pack.pageCount).toBe(7);
    expect(pack).toMatchObject({
      title: 'Q3 2026 Board pack',
      period: 'September 2026',
      organisation: 'Meridian',
    });
  });

  it('summarises sensitive initiatives at pillar level for the Board', () => {
    const pack = assemblePack(
      DATA,
      { ...ALL_BOARD, sections: [...ALL_BOARD.sections] },
      context,
    );
    const section = <K extends string>(key: K) =>
      pack.sections.find((s) => s.key === key)!;

    expect(pack.sensitiveSummarised).toBe(1);
    // Still counted in totals and pillar rows…
    expect(section('executive_summary')).toMatchObject({
      narrative: 'Execution is on track overall.',
      headline: {
        initiatives: 4,
        delayed: 2,
        openEscalations: 5,
        decisionsPending: 3,
        kpisOnTrajectory: 1,
      },
    });
    expect(section('pillar_performance')).toMatchObject({
      pillars: [
        { code: 'P1', initiatives: 3, atRisk: 1, delayed: 1 },
        { code: 'P2', initiatives: 1, delayed: 1 },
      ],
    });
    // …but never named.
    const exceptions = section('exceptions') as {
      initiatives: { code: string; gapPp: number }[];
    };
    expect(exceptions.initiatives.map((i) => i.code)).toEqual([
      'DIG-004',
      'DIG-009',
    ]);
    expect(exceptions.initiatives[0]!.gapPp).toBe(-9);
    const decisions = section('decisions') as {
      title: string;
      decisions: { reference: string }[];
    };
    expect(decisions.title).toBe('Decisions required from the Board');
    expect(decisions.decisions.map((d) => d.reference)).toEqual([
      'DEC-0003',
      'DEC-0001',
    ]);
    expect(section('delivery_vs_value')).toMatchObject({
      quadrants: {
        ON_PLAN_VALUE_LOW: ['DIG-001'],
        BEHIND_VALUE_OK: ['DIG-004', 'DIG-009'],
        BEHIND_VALUE_LOW: [],
      },
    });
  });

  it('shows EXCO everything', () => {
    const pack = assemblePack(
      DATA,
      { ...ALL_BOARD, audience: 'EXCO', sections: ['exceptions', 'decisions'] },
      context,
    );
    expect(pack.sensitiveSummarised).toBe(0);
    const exceptions = pack.sections[0] as { initiatives: { code: string }[] };
    expect(exceptions.initiatives.map((i) => i.code)).toEqual([
      'OPS-002',
      'DIG-004',
      'DIG-009',
    ]);
    expect(pack.sections[1]!.title).toBe('Decisions required');
  });

  it('builds a pillar deep dive from one pillar’s objectives, KPIs and initiatives', () => {
    const pack = assemblePack(
      DATA,
      {
        template: 'PILLAR_DEEP_DIVE',
        audience: 'EXCO',
        sections: [
          'pillar_overview',
          'pillar_kpis',
          'pillar_initiatives',
          'decisions',
        ],
        scopeElementId: 'p2',
        narrative: null,
      },
      context,
    );
    expect(pack.sections[0]).toMatchObject({
      title: 'Operations: overview and objectives',
      pillar: { code: 'P2' },
      objectives: [{ code: 'O2.1' }],
    });
    expect(pack.sections[1]).toMatchObject({
      kpis: [{ code: 'K02', objective: 'O2.1' }],
    });
    expect(pack.sections[2]).toMatchObject({
      initiatives: [{ code: 'OPS-002' }],
    });
    expect(pack.sections[3]).toMatchObject({
      decisions: [{ reference: 'DEC-0002' }],
    });
  });

  it('adds pages for long lists', () => {
    const many = Array.from({ length: 45 }, (_, n) =>
      initiative(`REV-${String(n).padStart(3, '0')}`, 'GREEN'),
    );
    const pack = assemblePack(
      { ...DATA, initiatives: many },
      {
        ...ALL_BOARD,
        audience: 'EXCO',
        template: 'MONTHLY_MANAGEMENT',
        sections: ['register'],
      },
      context,
    );
    expect(pack.sections[0]!.pages).toBe(3);
    expect(pack.pageCount).toBe(4);
  });
});

describe('pack names and versions', () => {
  it('names packs from the template and period', () => {
    expect(quarterOf('2026-09-30')).toBe('Q3 2026');
    expect(quarterOf('2026-08-31')).toBeNull();
    expect(defaultPackTitle('QUARTERLY_BOARD', DATA, null)).toBe(
      'Q3 2026 Board pack',
    );
    expect(defaultPackTitle('MONTHLY_MANAGEMENT', DATA, null)).toBe(
      'September 2026 management report',
    );
    expect(defaultPackTitle('PILLAR_DEEP_DIVE', DATA, 'Operations')).toBe(
      'Operations deep dive, September 2026',
    );
  });

  it('numbers versions 1.0, 1.1, 1.2…', () => {
    expect(nextVersion([])).toBe('1.0');
    expect(nextVersion(['1.0'])).toBe('1.1');
    expect(nextVersion(['1.0', '1.3', '1.1'])).toBe('1.4');
  });
});
