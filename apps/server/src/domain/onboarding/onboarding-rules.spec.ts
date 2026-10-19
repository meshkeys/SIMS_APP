import {
  customFieldKey,
  defaultPlanPeriod,
  missingSteps,
} from './onboarding-rules.js';

const day = (date: Date) => date.toISOString().slice(0, 10);

describe('defaultPlanPeriod', () => {
  it('covers three financial years from the current one (January year)', () => {
    const period = defaultPlanPeriod(1, new Date('2026-10-19T12:00:00Z'));
    expect(day(period.startDate)).toBe('2026-01-01');
    expect(day(period.endDate)).toBe('2028-12-31');
    expect(period.name).toBe('Strategic plan 2026–2028');
  });

  it('starts in last calendar year before the financial year turns', () => {
    const period = defaultPlanPeriod(4, new Date('2026-02-10T00:00:00Z'));
    expect(day(period.startDate)).toBe('2025-04-01');
    expect(day(period.endDate)).toBe('2028-03-31');
    expect(period.name).toBe('Strategic plan 2025–2028');
  });

  it('starts this year once the financial year has begun', () => {
    const period = defaultPlanPeriod(4, new Date('2026-04-01T00:00:00Z'));
    expect(day(period.startDate)).toBe('2026-04-01');
  });
});

describe('customFieldKey', () => {
  it('makes a machine name from the label', () => {
    expect(customFieldKey('Budget code')).toBe('budget_code');
    expect(customFieldKey('  Q3 / Funding source! ')).toBe('q3_funding_source');
    expect(customFieldKey('Café région')).toBe('cafe_region');
    expect(customFieldKey('!!!')).toBe('field');
  });
});

describe('missingSteps', () => {
  it('lists unsaved steps, judging the framework by the plan', () => {
    expect(missingSteps(1, false)).toEqual([
      'framework',
      'vision',
      'governance',
    ]);
    expect(missingSteps(3, true)).toEqual(['governance']);
    // Saved past the framework step, but the plan is gone: still missing.
    expect(missingSteps(4, false)).toEqual(['framework']);
    expect(missingSteps(4, true)).toEqual([]);
  });
});
