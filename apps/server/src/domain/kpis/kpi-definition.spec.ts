import { nextKpiCode, validateKpiDefinition } from './kpi-definition.js';

const kpi = (
  overrides: Partial<Parameters<typeof validateKpiDefinition>[0]>,
) => ({
  direction: 'HIGHER_IS_BETTER' as const,
  baseline: 18,
  target: 30,
  rangeLow: null,
  rangeHigh: null,
  ...overrides,
});

describe('validateKpiDefinition', () => {
  it('accepts sensible definitions', () => {
    expect(validateKpiDefinition(kpi({}))).toEqual([]);
    expect(
      validateKpiDefinition(
        kpi({ direction: 'LOWER_IS_BETTER', baseline: 68, target: 58 }),
      ),
    ).toEqual([]);
    expect(
      validateKpiDefinition(
        kpi({
          direction: 'WITHIN_RANGE',
          target: null,
          rangeLow: 95,
          rangeHigh: 99,
        }),
      ),
    ).toEqual([]);
    expect(validateKpiDefinition(kpi({ baseline: null }))).toEqual([]);
  });

  it('catches a target on the wrong side of the baseline', () => {
    expect(
      validateKpiDefinition(kpi({ target: 10 })).map((p) => p.path),
    ).toEqual(['target']);
    expect(
      validateKpiDefinition(
        kpi({ direction: 'LOWER_IS_BETTER', baseline: 72, target: 80 }),
      ).map((p) => p.path),
    ).toEqual(['target']);
  });

  it('catches a target equal to the baseline', () => {
    expect(validateKpiDefinition(kpi({ target: 18 }))[0].message).toMatch(
      /differ/,
    );
  });

  it('requires a complete, ordered range for range KPIs', () => {
    expect(
      validateKpiDefinition(kpi({ direction: 'WITHIN_RANGE' })).map(
        (p) => p.path,
      ),
    ).toEqual(['rangeLow', 'rangeHigh']);
    expect(
      validateKpiDefinition(
        kpi({ direction: 'WITHIN_RANGE', rangeLow: 99, rangeHigh: 95 }),
      ).map((p) => p.path),
    ).toEqual(['rangeHigh']);
  });

  it('rejects a range on a non-range KPI', () => {
    expect(
      validateKpiDefinition(kpi({ rangeLow: 1 })).map((p) => p.path),
    ).toEqual(['rangeLow']);
  });
});

describe('nextKpiCode', () => {
  it('continues the organisation’s numbering', () => {
    expect(nextKpiCode(['K01', 'K02', 'K18'])).toBe('K19');
    expect(nextKpiCode([])).toBe('K01');
    expect(nextKpiCode(['NPS', 'k07'])).toBe('K08');
  });
});
