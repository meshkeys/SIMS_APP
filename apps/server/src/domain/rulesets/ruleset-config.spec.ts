import { ZodError } from 'zod';
import {
  DEFAULT_RULESET_CONFIG,
  type EscalationLevelConfig,
  parseRulesetConfig,
  type RulesetConfig,
} from './ruleset-config.js';

const withLadder = (
  levels: EscalationLevelConfig[],
  criticalStartsAtLevel: number | null = null,
): RulesetConfig => ({
  ...DEFAULT_RULESET_CONFIG,
  escalation: { levels, criticalStartsAtLevel },
});

const level = (
  n: number,
  autoEscalateAfterDays: number | null,
): EscalationLevelConfig => ({
  level: n,
  name: `Level ${n}`,
  decidedBy: { type: 'ROLE', role: 'CEO' },
  autoEscalateAfterDays,
});

/** Paths of every validation issue, e.g. "escalation.levels.1.level". */
function issuePaths(config: unknown): string[] {
  try {
    parseRulesetConfig(config);
    return [];
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    return error.issues.map((issue) => issue.path.join('.'));
  }
}

describe('ruleset config', () => {
  it('accepts the defaults', () => {
    expect(parseRulesetConfig(DEFAULT_RULESET_CONFIG)).toEqual(
      DEFAULT_RULESET_CONFIG,
    );
  });

  describe('escalation ladder', () => {
    it('supports a two-level ladder for a small organisation', () => {
      expect(issuePaths(withLadder([level(1, 0), level(2, 5)]))).toEqual([]);
    });

    it('supports a six-level ladder for a large group', () => {
      const ladder = [
        level(1, 0),
        level(2, 5),
        level(3, 10),
        level(4, 15),
        level(5, 25),
        level(6, null),
      ];
      expect(issuePaths(withLadder(ladder, 4))).toEqual([]);
    });

    it('rejects gaps in level numbering', () => {
      expect(issuePaths(withLadder([level(1, 0), level(3, 7)]))).toContain(
        'escalation.levels.1.level',
      );
    });

    it('requires level 1 to start at day 0', () => {
      expect(issuePaths(withLadder([level(1, 3), level(2, 7)]))).toContain(
        'escalation.levels.0.autoEscalateAfterDays',
      );
    });

    it('requires timings to increase up the ladder', () => {
      expect(
        issuePaths(withLadder([level(1, 0), level(2, 10), level(3, 10)])),
      ).toContain('escalation.levels.2.autoEscalateAfterDays');
    });

    it('rejects automatic escalation above a manual-only level', () => {
      expect(
        issuePaths(withLadder([level(1, 0), level(2, null), level(3, 20)])),
      ).toContain('escalation.levels.2.autoEscalateAfterDays');
    });

    it('rejects a critical shortcut beyond the top of the ladder', () => {
      expect(issuePaths(withLadder([level(1, 0), level(2, 7)], 3))).toContain(
        'escalation.criticalStartsAtLevel',
      );
    });

    it('rejects an empty ladder and one above the maximum size', () => {
      expect(issuePaths(withLadder([]))).toContain('escalation.levels');
      const tooMany = Array.from({ length: 11 }, (_, i) => level(i + 1, i * 2));
      expect(issuePaths(withLadder(tooMany))).toContain('escalation.levels');
    });
  });

  it('requires the Amber limit to exceed the Green limit', () => {
    expect(
      issuePaths({
        ...DEFAULT_RULESET_CONFIG,
        rag: { greenMaxPpBehind: 10, amberMaxPpBehind: 10 },
      }),
    ).toEqual(['rag.amberMaxPpBehind']);
  });

  it('requires reporting stages to run in order without overlap', () => {
    expect(
      issuePaths({
        ...DEFAULT_RULESET_CONFIG,
        reportingCycle: {
          ...DEFAULT_RULESET_CONFIG.reportingCycle,
          strategyReview: { fromDay: 3, toDay: 5 },
        },
      }),
    ).toEqual(['reportingCycle.strategyReview.fromDay']);
  });

  it('rejects unknown schema versions', () => {
    expect(issuePaths({ ...DEFAULT_RULESET_CONFIG, schemaVersion: 2 })).toEqual(
      ['schemaVersion'],
    );
  });
});
