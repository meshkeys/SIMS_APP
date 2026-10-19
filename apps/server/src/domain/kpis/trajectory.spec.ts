import { DEFAULT_RULESET_CONFIG } from '../rulesets/ruleset-config.js';
import { kpiPosition, trajectoryFor } from './trajectory.js';

const impact = DEFAULT_RULESET_CONFIG.impact;

const nonInterestIncome = {
  direction: 'HIGHER_IS_BETTER' as const,
  baseline: 18,
  planTarget: 30,
  rangeLow: null,
  rangeHigh: null,
  targets: [
    { targetDate: '2026-12-31', value: 30 },
    { targetDate: '2025-12-31', value: 24 },
  ],
};

describe('kpiPosition', () => {
  it('uses the latest reading against the target due next after it', () => {
    const result = kpiPosition(
      nonInterestIncome,
      [
        { value: 21, at: '2026-08-31' },
        { value: 23, at: '2026-09-30' },
        { value: 20, at: '2026-07-31' },
      ],
      impact,
    );
    // 18 → 30 (FY2026), at 23: 41.7% of the way.
    expect(result).toEqual({
      latestValue: 23,
      latestAt: '2026-09-30',
      progress: 41.7,
      trajectory: 'SLIGHTLY_BEHIND',
    });
  });

  it('phases the expectation with interim targets', () => {
    // In 2025 the reading is judged against FY2025 (24): 22 is 66.7% → on trajectory.
    const result = kpiPosition(
      nonInterestIncome,
      [{ value: 22, at: '2025-06-30' }],
      impact,
    );
    expect(result.progress).toBe(66.7);
    expect(result.trajectory).toBe('ON_TRAJECTORY');
  });

  it('falls back to the plan target once every interim target has passed', () => {
    const result = kpiPosition(
      { ...nonInterestIncome, planTarget: 36 },
      [{ value: 27, at: '2027-03-31' }],
      impact,
    );
    expect(result.progress).toBe(50);
    expect(result.trajectory).toBe('ON_TRAJECTORY');
  });

  it('handles lower-is-better KPIs', () => {
    const costToIncome = {
      ...nonInterestIncome,
      direction: 'LOWER_IS_BETTER' as const,
      baseline: 68,
      planTarget: 58,
      targets: [],
    };
    expect(
      kpiPosition(costToIncome, [{ value: 61, at: '2026-09-30' }], impact),
    ).toMatchObject({ progress: 70, trajectory: 'ON_TRAJECTORY' });
    expect(
      kpiPosition(costToIncome, [{ value: 70, at: '2026-09-30' }], impact),
    ).toMatchObject({ progress: -20, trajectory: 'OFF_TRAJECTORY' });
  });

  it('treats a within-range KPI inside its range as on trajectory', () => {
    const availability = {
      ...nonInterestIncome,
      direction: 'WITHIN_RANGE' as const,
      baseline: 97,
      planTarget: null,
      rangeLow: 99,
      rangeHigh: 100,
      targets: [],
    };
    expect(
      kpiPosition(availability, [{ value: 99.5, at: '2026-09-30' }], impact)
        .trajectory,
    ).toBe('ON_TRAJECTORY');
  });

  it('is not measurable without a reading, a baseline or a target', () => {
    expect(kpiPosition(nonInterestIncome, [], impact)).toEqual({
      latestValue: null,
      latestAt: null,
      progress: null,
      trajectory: 'NOT_MEASURABLE',
    });
    expect(
      kpiPosition(
        { ...nonInterestIncome, baseline: null },
        [{ value: 23, at: '2026-09-30' }],
        impact,
      ),
    ).toMatchObject({ latestValue: 23, trajectory: 'NOT_MEASURABLE' });
  });
});

describe('trajectoryFor', () => {
  it('bands progress with the organisation’s thresholds', () => {
    expect(trajectoryFor(50, impact)).toBe('ON_TRAJECTORY');
    expect(trajectoryFor(49.9, impact)).toBe('SLIGHTLY_BEHIND');
    expect(trajectoryFor(40, impact)).toBe('SLIGHTLY_BEHIND');
    expect(trajectoryFor(39.9, impact)).toBe('OFF_TRAJECTORY');
    expect(
      trajectoryFor(55, {
        ...impact,
        onTrajectoryMinPct: 60,
        slightlyBehindMinPct: 45,
      }),
    ).toBe('SLIGHTLY_BEHIND');
  });
});
