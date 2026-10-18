import {
  DEFAULT_RULESET_CONFIG,
  type RulesetConfig,
} from '../rulesets/ruleset-config.js';
import {
  calculateHealth,
  effectiveHealth,
  type HealthFacts,
} from './health.js';
import { plannedCompletion, verifiedCompletion } from './progress.js';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const TODAY = d('2026-10-16');

/** The Digital Investment Platform (DIG-004) exactly as on the initiative detail page. */
const DIG_004 = [
  {
    title: 'Business case approved',
    weight: 20,
    verifiedCompletion: 100,
    baselineStartDate: d('2026-03-01'),
    baselineDate: d('2026-03-31'),
  },
  {
    title: 'Vendor contract signed',
    weight: 0,
    verifiedCompletion: 0,
    baselineStartDate: d('2026-04-01'),
    baselineDate: d('2026-10-07'),
  },
  {
    title: 'Technology development',
    weight: 40,
    verifiedCompletion: 85,
    baselineStartDate: d('2026-04-01'),
    baselineDate: d('2026-10-15'),
  },
  {
    title: 'Testing and deployment',
    weight: 25,
    verifiedCompletion: 44,
    baselineStartDate: d('2026-08-20'),
    baselineDate: d('2026-11-30'),
  },
  {
    title: 'Commercial launch',
    weight: 15,
    verifiedCompletion: 0,
    baselineStartDate: d('2026-12-01'),
    baselineDate: d('2026-12-31'),
  },
];

const facts = (overrides: Partial<HealthFacts> = {}): HealthFacts => ({
  plannedProgress: 50,
  verifiedProgress: 50,
  criticalMilestones: [],
  openCriticalIssues: [],
  blockedDependencies: [],
  missedUpdate: null,
  overdueUpdate: null,
  today: TODAY,
  ...overrides,
});

const rules = (
  change: (config: RulesetConfig) => void = () => {},
): RulesetConfig => {
  const config = structuredClone(DEFAULT_RULESET_CONFIG);
  change(config);
  return config;
};

describe('completion', () => {
  it('computes DIG-004’s verified completion: 65%', () => {
    expect(verifiedCompletion(DIG_004)).toBe(65);
  });

  it('computes DIG-004’s planned completion today: 74%', () => {
    expect(plannedCompletion(DIG_004, TODAY, d('2026-03-01'))).toBeCloseTo(
      74,
      0,
    );
  });

  it('plans nothing before the start and everything after the end', () => {
    expect(plannedCompletion(DIG_004, d('2026-02-01'), null)).toBe(0);
    expect(plannedCompletion(DIG_004, d('2027-01-31'), null)).toBe(100);
  });

  it('progresses evenly across a milestone window', () => {
    const one = [
      {
        weight: 10,
        verifiedCompletion: 0,
        baselineStartDate: d('2026-01-01'),
        baselineDate: d('2026-01-11'),
      },
    ];
    expect(plannedCompletion(one, d('2026-01-06'), null)).toBe(50);
  });

  it('uses the initiative start when a milestone has no planned start', () => {
    const one = [
      {
        weight: 10,
        verifiedCompletion: 0,
        baselineStartDate: null,
        baselineDate: d('2026-01-11'),
      },
    ];
    expect(plannedCompletion(one, d('2026-01-06'), d('2026-01-01'))).toBe(50);
    // No start at all: the milestone is due in one step on its date.
    expect(plannedCompletion(one, d('2026-01-06'), null)).toBe(0);
  });

  it('ignores weightless milestones and handles none at all', () => {
    expect(
      verifiedCompletion([
        {
          weight: 0,
          verifiedCompletion: 100,
          baselineStartDate: null,
          baselineDate: TODAY,
        },
      ]),
    ).toBe(0);
    expect(verifiedCompletion([])).toBe(0);
    expect(plannedCompletion([], TODAY, null)).toBe(0);
  });
});

describe('calculateHealth', () => {
  describe('progress bands (Green ≤ 5 pp, Amber ≤ 15 pp)', () => {
    it.each([
      [70, 70, 'GREEN', 'On plan'],
      [70, 75, 'GREEN', '5 pp ahead of plan'],
      [75, 70, 'GREEN', '5 pp behind plan'],
      [75.01, 70, 'AMBER', '5 pp behind plan'],
      [85, 70, 'AMBER', '15 pp behind plan'],
      [85.5, 70, 'RED', '15.5 pp behind plan'],
    ])(
      'planned %d%%, verified %d%% → %s',
      (planned, verified, health, detail) => {
        const result = calculateHealth(
          facts({ plannedProgress: planned, verifiedProgress: verified }),
          DEFAULT_RULESET_CONFIG,
        );
        expect(result.health).toBe(health);
        expect(result.reasons[0].detail).toContain(detail);
      },
    );

    it('uses the organisation’s own thresholds', () => {
      const strict = rules((c) => {
        c.rag = { greenMaxPpBehind: 2, amberMaxPpBehind: 8 };
      });
      expect(
        calculateHealth(facts({ plannedProgress: 54 }), strict).health,
      ).toBe('AMBER');
      expect(
        calculateHealth(facts({ plannedProgress: 59 }), strict).health,
      ).toBe('RED');
    });
  });

  it('reproduces DIG-004: Amber on progress, forced Red by the overdue contract', () => {
    const result = calculateHealth(
      facts({
        plannedProgress: 74,
        verifiedProgress: 65,
        criticalMilestones: [
          {
            title: 'Vendor contract signed',
            baselineDate: d('2026-10-07'),
            complete: false,
          },
        ],
      }),
      DEFAULT_RULESET_CONFIG,
    );

    expect(result).toEqual({
      health: 'RED',
      ppBehind: 9,
      updateOverdue: null,
      reasons: [
        {
          rule: 'PROGRESS_VS_PLAN',
          effect: 'BASE',
          result: 'AMBER',
          detail: '9 pp behind plan (Green up to 5 pp, Amber up to 15 pp)',
        },
        {
          rule: 'OVERDUE_CRITICAL_MILESTONE',
          effect: 'FORCE_RED',
          result: 'RED',
          detail:
            'Critical milestone "Vendor contract signed" overdue by 9 days',
        },
      ],
    });
  });

  it('ignores critical milestones that are complete or not yet due', () => {
    const result = calculateHealth(
      facts({
        criticalMilestones: [
          { title: 'Done late', baselineDate: d('2026-09-01'), complete: true },
          { title: 'Due today', baselineDate: TODAY, complete: false },
        ],
      }),
      DEFAULT_RULESET_CONFIG,
    );
    expect(result.health).toBe('GREEN');
  });

  it('caps an on-plan initiative with a critical issue at Amber', () => {
    const result = calculateHealth(
      facts({ openCriticalIssues: [{ title: 'Regulatory blocker' }] }),
      DEFAULT_RULESET_CONFIG,
    );
    expect(result.health).toBe('AMBER');
    expect(result.reasons[1]).toMatchObject({
      rule: 'OPEN_CRITICAL_ISSUE',
      detail: 'Open critical issue: "Regulatory blocker"',
    });
  });

  it('never improves a worse status with a cap', () => {
    const result = calculateHealth(
      facts({ plannedProgress: 90, openCriticalIssues: [{ title: 'X' }] }),
      DEFAULT_RULESET_CONFIG,
    );
    expect(result.health).toBe('RED');
  });

  describe('blocked dependencies', () => {
    const blocked = (since: string, isCriticalPath = true) => ({
      title: 'DIG-011 Core Banking API Layer',
      blockedSince: d(since),
      isCriticalPath,
    });

    it('caps at Amber once blocked for the configured number of days', () => {
      expect(
        calculateHealth(
          facts({ blockedDependencies: [blocked('2026-10-03')] }),
          DEFAULT_RULESET_CONFIG,
        ).health,
      ).toBe('GREEN');
      const result = calculateHealth(
        facts({ blockedDependencies: [blocked('2026-10-02')] }),
        DEFAULT_RULESET_CONFIG,
      );
      expect(result.health).toBe('AMBER');
      expect(result.reasons[1].detail).toBe(
        'Blocked for 14 days by DIG-011 Core Banking API Layer',
      );
    });

    it('considers only critical-path dependencies when configured', () => {
      expect(
        calculateHealth(
          facts({ blockedDependencies: [blocked('2026-09-01', false)] }),
          DEFAULT_RULESET_CONFIG,
        ).health,
      ).toBe('GREEN');
      const allPaths = rules((c) => {
        c.healthModifiers.blockedDependencyCapsAtAmber.criticalPathOnly = false;
      });
      expect(
        calculateHealth(
          facts({ blockedDependencies: [blocked('2026-09-01', false)] }),
          allPaths,
        ).health,
      ).toBe('AMBER');
    });
  });

  describe('missed updates', () => {
    const missed = { periodName: 'September 2026' };

    it('makes the status Unknown rather than carrying a stale Green', () => {
      const result = calculateHealth(
        facts({ missedUpdate: missed }),
        DEFAULT_RULESET_CONFIG,
      );
      expect(result.health).toBe('UNKNOWN');
      expect(result.reasons.at(-1)?.detail).toBe(
        'No update submitted for September 2026',
      );
    });

    it('keeps a Red forced by an overdue critical milestone', () => {
      const result = calculateHealth(
        facts({
          missedUpdate: missed,
          criticalMilestones: [
            {
              title: 'Go-live',
              baselineDate: d('2026-10-01'),
              complete: false,
            },
          ],
        }),
        DEFAULT_RULESET_CONFIG,
      );
      expect(result.health).toBe('RED');
    });
  });

  describe('overdue updates in the open period', () => {
    const october = {
      periodName: 'October 2026',
      dueAt: new Date('2026-10-10T16:00:00Z'),
    };

    it('flags the status as not fresh without changing it', () => {
      const result = calculateHealth(
        facts({
          plannedProgress: 74,
          verifiedProgress: 52,
          overdueUpdate: october,
          today: new Date('2026-10-16T09:00:00Z'),
        }),
        DEFAULT_RULESET_CONFIG,
      );
      expect(result.health).toBe('RED');
      expect(result.updateOverdue).toEqual({
        periodName: 'October 2026',
        daysOverdue: 6,
      });
      expect(result.reasons.at(-1)).toEqual({
        rule: 'UPDATE_OVERDUE',
        effect: 'FLAG',
        result: 'RED',
        detail:
          'October 2026 update overdue by 6 days (due 10 Oct); figures are from the last update',
      });
    });

    it('says nothing before the deadline', () => {
      const result = calculateHealth(
        facts({
          overdueUpdate: october,
          today: new Date('2026-10-10T15:59:00Z'),
        }),
        DEFAULT_RULESET_CONFIG,
      );
      expect(result.updateOverdue).toBeNull();
      expect(result.reasons).toHaveLength(1);
    });

    it('flags from the minute the deadline passes', () => {
      const result = calculateHealth(
        facts({
          overdueUpdate: october,
          today: new Date('2026-10-10T16:01:00Z'),
        }),
        DEFAULT_RULESET_CONFIG,
      );
      expect(result.updateOverdue).toEqual({
        periodName: 'October 2026',
        daysOverdue: 0,
      });
      expect(result.reasons.at(-1)?.detail).toBe(
        'October 2026 update overdue since today; figures are from the last update',
      );
    });

    it('lets a silent initiative drift worse as planned progress rises', () => {
      const early = calculateHealth(
        facts({ plannedProgress: 54, verifiedProgress: 50 }),
        DEFAULT_RULESET_CONFIG,
      );
      const later = calculateHealth(
        facts({ plannedProgress: 62, verifiedProgress: 50 }),
        DEFAULT_RULESET_CONFIG,
      );
      expect([early.health, later.health]).toEqual(['GREEN', 'AMBER']);
    });
  });

  it('applies nothing the organisation has switched off', () => {
    const off = rules((c) => {
      c.healthModifiers = {
        overdueCriticalMilestoneForcesRed: false,
        openCriticalIssueCapsAtAmber: false,
        blockedDependencyCapsAtAmber: {
          enabled: false,
          minDaysBlocked: 14,
          criticalPathOnly: true,
        },
        missedUpdateMakesUnknown: false,
      };
    });
    const result = calculateHealth(
      facts({
        criticalMilestones: [
          { title: 'Late', baselineDate: d('2026-09-01'), complete: false },
        ],
        openCriticalIssues: [{ title: 'Issue' }],
        blockedDependencies: [
          { title: 'Dep', blockedSince: d('2026-08-01'), isCriticalPath: true },
        ],
        missedUpdate: { periodName: 'September 2026' },
      }),
      off,
    );
    expect(result.health).toBe('GREEN');
    expect(result.reasons).toHaveLength(1);
  });

  it('summarises several triggers of the same rule', () => {
    const result = calculateHealth(
      facts({
        criticalMilestones: [
          { title: 'A', baselineDate: d('2026-10-10'), complete: false },
          { title: 'B', baselineDate: d('2026-09-16'), complete: false },
        ],
      }),
      DEFAULT_RULESET_CONFIG,
    );
    expect(result.reasons[1].detail).toBe(
      'Critical milestone "B" overdue by 30 days (and 1 more)',
    );
  });
});

describe('effectiveHealth', () => {
  const dig004 = {
    calculatedHealth: 'RED' as const,
    healthOverride: 'AMBER' as const,
    overrideExpiresAt: d('2026-10-31'),
  };

  it('shows a valid override', () => {
    expect(effectiveHealth(dig004, TODAY)).toEqual({
      health: 'AMBER',
      overridden: true,
    });
  });

  it('falls back to the calculated status once the override expires', () => {
    expect(effectiveHealth(dig004, d('2026-11-01'))).toEqual({
      health: 'RED',
      overridden: false,
    });
  });

  it('shows the calculated status when there is no override', () => {
    expect(
      effectiveHealth(
        { ...dig004, healthOverride: null, overrideExpiresAt: null },
        TODAY,
      ),
    ).toEqual({
      health: 'RED',
      overridden: false,
    });
  });
});
