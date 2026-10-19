import {
  DEFAULT_RULESET_CONFIG,
  type RulesetImpact,
  type RulesetsOverview,
  type RulesetView,
} from '@sims/contracts';

const id = (n: number) =>
  `0192a1b2-c3d4-7e5f-8a9b-${String(n).padStart(12, '0')}`;

const amara = {
  membershipId: id(901),
  name: 'Amara Bello',
  jobTitle: 'Head, Strategy Office',
};
const ceo = {
  membershipId: id(902),
  name: 'Adaeze Okafor',
  jobTitle: 'Group Managing Director',
};

const version = (over: Partial<RulesetView>): RulesetView => ({
  id: id(400),
  version: 4,
  status: 'ACTIVE',
  config: DEFAULT_RULESET_CONFIG,
  changeSummary: 'Amber band tightened to 15 pp; missed updates show Unknown.',
  changes: ['Amber up to: 20 pp → 15 pp'],
  proposedBy: amara,
  approvedBy: ceo,
  effectiveFrom: '2026-01-12T10:00:00.000Z',
  createdAt: '2026-01-05T10:00:00.000Z',
  decisionId: null,
  can: { withdraw: false },
  ...over,
});

export const ACTIVE = version({});
const V3 = version({
  id: id(300),
  version: 3,
  status: 'SUPERSEDED',
  config: {
    ...DEFAULT_RULESET_CONFIG,
    rag: { greenMaxPpBehind: 5, amberMaxPpBehind: 20 },
  },
  changeSummary: 'FY2025 rules',
  changes: [],
  effectiveFrom: '2025-01-15T10:00:00.000Z',
});

export const OVERVIEW: RulesetsOverview = {
  active: ACTIVE,
  pending: null,
  history: [ACTIVE, V3],
  can: { propose: true },
};

export const PENDING = version({
  id: id(500),
  version: 5,
  status: 'PENDING_APPROVAL',
  config: {
    ...DEFAULT_RULESET_CONFIG,
    overrides: { ...DEFAULT_RULESET_CONFIG.overrides, expiryDays: 45 },
  },
  changeSummary: 'Longer overrides for the year-end freeze.',
  changes: ['Overrides expire after: 30 days → 45 days'],
  approvedBy: null,
  effectiveFrom: null,
  createdAt: '2026-10-15T10:00:00.000Z',
  decisionId: id(600),
  can: { withdraw: true },
});

/** What the server answers for "Green up to 10 pp". */
export const IMPACT: RulesetImpact = {
  changes: ['Green up to: 5 pp → 10 pp'],
  health: {
    initiatives: 32,
    live: { GREEN: 21, AMBER: 7, RED: 4, UNKNOWN: 0 },
    proposed: { GREEN: 23, AMBER: 5, RED: 4, UNKNOWN: 0 },
    changes: [
      {
        code: 'DIG-009',
        title: 'Payment Switch Upgrade',
        from: 'AMBER',
        to: 'GREEN',
      },
      {
        code: 'REV-007',
        title: 'Treasury Sales Desk',
        from: 'AMBER',
        to: 'GREEN',
      },
    ],
  },
  kpis: {
    live: {
      ON_TRAJECTORY: 9,
      SLIGHTLY_BEHIND: 5,
      OFF_TRAJECTORY: 4,
      NOT_MEASURABLE: 0,
    },
    proposed: {
      ON_TRAJECTORY: 9,
      SLIGHTLY_BEHIND: 5,
      OFF_TRAJECTORY: 4,
      NOT_MEASURABLE: 0,
    },
    changes: [],
  },
  lowValue: { live: 5, proposed: 5 },
};
