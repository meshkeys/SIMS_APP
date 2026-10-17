import { canSeeInitiative } from '../access/initiative-visibility.js';
import { nextElementCode, numberingOf } from './element-codes.js';
import {
  FRAMEWORK_TEMPLATES,
  planLevelChanges,
  type ExistingLevel,
} from './framework.js';
import { progressToTarget } from './kpi-progress.js';

const level = (label: string, prefix: string, allowsKpis = false) => ({
  label,
  pluralLabel: `${label}s`,
  codePrefix: prefix,
  allowsKpis,
});

describe('planLevelChanges', () => {
  const existing: ExistingLevel[] = [
    {
      id: 'pillar',
      depth: 1,
      label: 'Strategic pillar',
      elementCount: 5,
      kpiCount: 0,
    },
    {
      id: 'objective',
      depth: 2,
      label: 'Strategic objective',
      elementCount: 10,
      kpiCount: 18,
    },
  ];

  it('renames levels in place', () => {
    const plan = planLevelChanges(existing, [
      { id: 'pillar', ...level('Theme', 'T') },
      { id: 'objective', ...level('Goal', 'G', true) },
    ]);
    expect(plan.problems).toEqual([]);
    expect(
      plan.updates.map((u) => [u.id, u.depth, u.definition.label]),
    ).toEqual([
      ['pillar', 1, 'Theme'],
      ['objective', 2, 'Goal'],
    ]);
    expect(plan.creates).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
  });

  it('adds a level below the deepest one in use', () => {
    const plan = planLevelChanges(existing, [
      { id: 'pillar', ...level('Strategic pillar', 'P') },
      { id: 'objective', ...level('Strategic objective', 'O', true) },
      level('Key result', 'KR', true),
    ]);
    expect(plan.problems).toEqual([]);
    expect(plan.creates).toEqual([
      { depth: 3, definition: level('Key result', 'KR', true) },
    ]);
  });

  it('refuses to remove or move a level that holds items', () => {
    const removed = planLevelChanges(existing, [
      { id: 'pillar', ...level('Strategic pillar', 'P') },
    ]);
    expect(removed.problems.map((p) => p.code)).toEqual(['LEVEL_IN_USE']);

    const inserted = planLevelChanges(existing, [
      level('Vision theme', 'V'),
      { id: 'pillar', ...level('Strategic pillar', 'P') },
      { id: 'objective', ...level('Strategic objective', 'O', true) },
    ]);
    expect(inserted.problems.map((p) => p.path)).toEqual([
      'levels.1',
      'levels.2',
    ]);
  });

  it('refuses to switch off KPIs on a level that has them', () => {
    const plan = planLevelChanges(existing, [
      { id: 'pillar', ...level('Strategic pillar', 'P') },
      { id: 'objective', ...level('Strategic objective', 'O', false) },
    ]);
    expect(plan.problems).toEqual([
      expect.objectContaining({
        path: 'levels.1.allowsKpis',
        code: 'LEVEL_IN_USE',
      }),
    ]);
  });

  it('moves and removes empty levels freely, keeping ids', () => {
    const empty: ExistingLevel[] = [
      { id: 'a', depth: 1, label: 'A', elementCount: 0, kpiCount: 0 },
      { id: 'b', depth: 2, label: 'B', elementCount: 0, kpiCount: 0 },
      { id: 'c', depth: 3, label: 'C', elementCount: 0, kpiCount: 0 },
    ];
    const plan = planLevelChanges(empty, [
      { id: 'b', ...level('B', 'B') },
      { id: 'a', ...level('A', 'A') },
    ]);
    expect(plan.problems).toEqual([]);
    expect(plan.deleteIds.sort()).toEqual(['a', 'b', 'c']);
    expect(plan.creates.map((c) => [c.id, c.depth])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });

  it('rejects duplicate names, prefixes and unknown levels', () => {
    const plan = planLevelChanges(existing, [
      { id: 'pillar', ...level('Pillar', 'P') },
      { id: 'objective', ...level('pillar', 'p', true) },
      { id: 'nope', ...level('Other', 'X') },
    ]);
    expect(plan.problems.map((p) => p.code)).toEqual(
      expect.arrayContaining([
        'DUPLICATE_LABEL',
        'DUPLICATE_PREFIX',
        'UNKNOWN_LEVEL',
      ]),
    );
  });

  it('offers templates whose levels are all valid', () => {
    for (const template of Object.values(FRAMEWORK_TEMPLATES)) {
      const plan = planLevelChanges([], template.levels);
      expect(plan.problems).toEqual([]);
    }
  });
});

describe('element codes', () => {
  it('numbers top-level elements', () => {
    expect(
      nextElementCode({ prefix: 'P', siblingCodes: ['P1', 'P2', 'P5'] }),
    ).toBe('P6');
    expect(nextElementCode({ prefix: 'P', siblingCodes: [] })).toBe('P1');
  });

  it('continues the parent’s numbering', () => {
    expect(
      nextElementCode({
        prefix: 'O',
        parentCode: 'P1',
        siblingCodes: ['O1.1', 'O1.2'],
      }),
    ).toBe('O1.3');
    expect(
      nextElementCode({ prefix: 'KR', parentCode: 'O1.2', siblingCodes: [] }),
    ).toBe('KR1.2.1');
  });

  it('ignores custom codes that do not follow the pattern', () => {
    expect(
      nextElementCode({
        prefix: 'O',
        parentCode: 'P2',
        siblingCodes: ['GROWTH', 'O2.1'],
      }),
    ).toBe('O2.2');
  });

  it('extracts numbering', () => {
    expect(numberingOf('SO3.1')).toBe('3.1');
  });
});

describe('progressToTarget', () => {
  it('matches the wireframe figures', () => {
    expect(
      progressToTarget({
        direction: 'HIGHER_IS_BETTER',
        baseline: 18,
        target: 30,
        actual: 23,
      }),
    ).toBe(41.7);
    expect(
      progressToTarget({
        direction: 'HIGHER_IS_BETTER',
        baseline: 6,
        target: 20,
        actual: 14,
      }),
    ).toBe(57.1);
  });

  it('handles lower-is-better KPIs', () => {
    expect(
      progressToTarget({
        direction: 'LOWER_IS_BETTER',
        baseline: 68,
        target: 58,
        actual: 61,
      }),
    ).toBe(70);
  });

  it('shows movement in the wrong direction as negative', () => {
    expect(
      progressToTarget({
        direction: 'LOWER_IS_BETTER',
        baseline: 72,
        target: 24,
        actual: 80,
      }),
    ).toBe(-16.7);
  });

  it('scores within-range KPIs', () => {
    const range = {
      direction: 'WITHIN_RANGE' as const,
      baseline: 50,
      target: null,
      rangeLow: 90,
      rangeHigh: 95,
    };
    expect(progressToTarget({ ...range, actual: 92 })).toBe(100);
    expect(progressToTarget({ ...range, actual: 70 })).toBe(50);
  });

  it('returns null when not measurable', () => {
    expect(
      progressToTarget({
        direction: 'HIGHER_IS_BETTER',
        baseline: 10,
        target: 20,
        actual: null,
      }),
    ).toBeNull();
    expect(
      progressToTarget({
        direction: 'HIGHER_IS_BETTER',
        baseline: 10,
        target: 10,
        actual: 12,
      }),
    ).toBeNull();
  });
});

describe('canSeeInitiative', () => {
  const sensitive = {
    isSensitive: true,
    ownerId: 'owner',
    sponsorId: 'sponsor',
    benefitsOwnerId: null,
  };

  it('shows ordinary initiatives to everyone', () => {
    expect(
      canSeeInitiative(
        { membershipId: 'x', roles: ['TASK_OWNER'] },
        { ...sensitive, isSensitive: false },
      ),
    ).toBe(true);
  });

  it('restricts sensitive initiatives to oversight roles and accountable people', () => {
    expect(
      canSeeInitiative(
        { membershipId: 'x', roles: ['STRATEGY_OFFICE'] },
        sensitive,
      ),
    ).toBe(true);
    expect(
      canSeeInitiative(
        { membershipId: 'sponsor', roles: ['EXECUTIVE_SPONSOR'] },
        sensitive,
      ),
    ).toBe(true);
    expect(
      canSeeInitiative({ membershipId: 'x', roles: ['BOARD'] }, sensitive),
    ).toBe(false);
    expect(
      canSeeInitiative(
        { membershipId: 'x', roles: ['INITIATIVE_OWNER'] },
        sensitive,
      ),
    ).toBe(false);
  });
});
