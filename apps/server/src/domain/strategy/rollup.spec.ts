import { DEFAULT_RULESET_CONFIG } from '../rulesets/ruleset-config.js';
import { rollupElements, valueQuadrant } from './rollup.js';

const elements = [
  { id: 'P1', parentId: null },
  { id: 'O1', parentId: 'P1' },
  { id: 'O2', parentId: 'P1' },
  { id: 'P2', parentId: null },
];

describe('rollupElements', () => {
  const initiatives = new Map([
    ['a', { verified: 80, planned: 80 }], // on plan
    ['b', { verified: 40, planned: 60 }], // 20 pp behind
    ['c', { verified: 50, planned: 50 }],
  ]);

  it('scores execution as delivered ÷ planned, weighted by contribution', () => {
    const result = rollupElements(
      elements,
      [
        { elementId: 'O1', initiativeId: 'a', weight: 50 },
        { elementId: 'O1', initiativeId: 'b', weight: 50 },
        { elementId: 'O2', initiativeId: 'c', weight: 100 },
      ],
      initiatives,
      [],
      DEFAULT_RULESET_CONFIG,
    );
    // O1: (50×80 + 50×40) ÷ (50×80 + 50×60) = 6000 ÷ 7000
    expect(result.get('O1')).toMatchObject({
      executionScore: 85.71,
      ppBehind: 10,
      health: 'AMBER',
    });
    expect(result.get('O2')).toMatchObject({
      executionScore: 100,
      ppBehind: 0,
      health: 'GREEN',
    });
    // P1 combines both objectives: (4000 + 2000 + 5000) ÷ (4000 + 3000 + 5000)
    expect(result.get('P1')).toMatchObject({
      executionScore: 91.67,
      ppBehind: 5,
      health: 'GREEN',
    });
    // Nothing delivers P2 yet.
    expect(result.get('P2')).toMatchObject({
      executionScore: null,
      health: 'UNKNOWN',
    });
  });

  it('averages KPI progress up the tree, clamped to 0–100', () => {
    const result = rollupElements(
      elements,
      [],
      new Map(),
      [
        { elementId: 'O1', progress: 41.7 },
        { elementId: 'O1', progress: 57.1 },
        { elementId: 'O2', progress: 130 },
        { elementId: 'O2', progress: -20 },
        { elementId: 'O2', progress: null },
      ],
      DEFAULT_RULESET_CONFIG,
    );
    expect(result.get('O1')?.impactScore).toBe(49.4);
    expect(result.get('O2')?.impactScore).toBe(50);
    expect(result.get('P1')?.impactScore).toBe(49.7);
  });

  it('treats an element whose initiatives have nothing planned yet as fully on track', () => {
    const result = rollupElements(
      elements,
      [{ elementId: 'O1', initiativeId: 'new', weight: 10 }],
      new Map([['new', { verified: 0, planned: 0 }]]),
      [],
      DEFAULT_RULESET_CONFIG,
    );
    expect(result.get('O1')).toMatchObject({
      executionScore: 100,
      health: 'GREEN',
    });
  });
});

describe('valueQuadrant', () => {
  it.each([
    ['GREEN', 72, 'ON_PLAN_VALUE_OK'],
    ['GREEN', 20, 'ON_PLAN_VALUE_LOW'],
    ['AMBER', 60, 'BEHIND_VALUE_OK'],
    ['RED', 10, 'BEHIND_VALUE_LOW'],
    ['UNKNOWN', 55, 'BEHIND_VALUE_OK'],
    ['GREEN', null, 'NOT_MEASURABLE'],
  ] as const)('%s with impact %s → %s', (health, impact, quadrant) => {
    expect(valueQuadrant(health, impact, 50)).toBe(quadrant);
  });
});
