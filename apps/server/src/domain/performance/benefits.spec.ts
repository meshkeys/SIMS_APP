import { benefitYear, isDeliveredLowValue } from './benefits.js';

describe('benefitYear', () => {
  const expected = [
    { periodEnd: '2026-03-31', expected: 600, forecast: null },
    { periodEnd: '2026-06-30', expected: 900, forecast: null },
    { periodEnd: '2026-09-30', expected: 1200, forecast: null },
    { periodEnd: '2026-12-31', expected: 1000, forecast: 600 },
    { periodEnd: '2026-12-31', expected: 500, forecast: 300 },
    { periodEnd: '2027-03-31', expected: 150, forecast: null },
  ];
  const realised = [
    { periodEnd: '2026-03-31', realised: 520 },
    { periodEnd: '2026-06-30', realised: 400 },
    { periodEnd: '2026-06-30', realised: 300 },
    { periodEnd: '2026-09-30', realised: 680 },
    { periodEnd: '2025-12-31', realised: 999 },
  ];

  it('totals the year by quarter, with forecasts and capture rates', () => {
    const year = benefitYear(2026, expected, realised, '2026-10-17');

    expect(year.quarters).toEqual([
      expect.objectContaining({
        label: 'Q1',
        expected: 600,
        realised: 520,
        captureRate: 87,
        complete: true,
      }),
      expect.objectContaining({
        label: 'Q2',
        expected: 900,
        realised: 700,
        captureRate: 78,
      }),
      expect.objectContaining({
        label: 'Q3',
        expected: 1200,
        realised: 680,
        captureRate: 57,
      }),
      expect.objectContaining({
        label: 'Q4',
        periodEnd: '2026-12-31',
        expected: 1500,
        realised: null,
        forecast: 900,
        complete: false,
        captureRate: null,
      }),
    ]);
    expect(year).toMatchObject({
      expected: 4200,
      expectedToDate: 2700,
      realisedToDate: 1900,
      realisedPctOfExpected: 70,
    });
  });

  it('shows nothing realised in a finished quarter as zero', () => {
    const year = benefitYear(2026, expected, [], '2026-07-01');
    expect(year.quarters.map((q) => q.realised)).toEqual([0, 0, null, null]);
    expect(year.realisedPctOfExpected).toBe(0);
  });

  it('has no percentage before anything was expected', () => {
    const year = benefitYear(2026, [], [], '2026-02-01');
    expect(year.expected).toBe(0);
    expect(year.realisedPctOfExpected).toBeNull();
  });
});

describe('isDeliveredLowValue', () => {
  it('flags closed or on-plan work whose impact is below the threshold', () => {
    const at = (
      status: 'ACTIVE' | 'CLOSED' | 'ON_HOLD',
      health: 'GREEN' | 'AMBER',
      impactScore: number | null,
    ) => isDeliveredLowValue({ status, health, impactScore }, 50);

    expect(at('CLOSED', 'AMBER', 35)).toBe(true);
    expect(at('ACTIVE', 'GREEN', 20)).toBe(true);
    expect(at('ACTIVE', 'AMBER', 20)).toBe(false);
    expect(at('ACTIVE', 'GREEN', 50)).toBe(false);
    expect(at('ON_HOLD', 'GREEN', 20)).toBe(false);
    expect(at('CLOSED', 'GREEN', null)).toBe(false);
  });
});
