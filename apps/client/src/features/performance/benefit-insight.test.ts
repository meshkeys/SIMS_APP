import type { BenefitQuarter } from '@sims/contracts';
import { benefitInsight, niceTicks } from './benefit-insight';

const quarter = (
  label: BenefitQuarter['label'],
  captureRate: number | null,
  complete = true,
): BenefitQuarter => ({
  label,
  periodEnd: '2026-03-31',
  expected: 100,
  realised: captureRate,
  forecast: null,
  complete,
  captureRate,
});

describe('benefitInsight', () => {
  it('says where realisation started falling behind', () => {
    expect(
      benefitInsight([
        quarter('Q1', 87),
        quarter('Q2', 78),
        quarter('Q3', 57),
        quarter('Q4', null, false),
      ]),
    ).toBe(
      'Realisation is falling behind from Q3: 57% of expected value captured against 87% in Q1.',
    );
  });

  it('reports the latest quarter when there is no slide', () => {
    expect(benefitInsight([quarter('Q1', 80), quarter('Q2', 84)])).toBe(
      '84% of expected value captured in Q2.',
    );
    expect(benefitInsight([quarter('Q1', 104)])).toBe(
      'Realisation is on or ahead of expectation: 104% of expected value captured in Q1.',
    );
  });

  it('has nothing to say before a quarter has ended', () => {
    expect(benefitInsight([quarter('Q1', 40, false)])).toBeNull();
  });
});

describe('niceTicks', () => {
  it('picks round steps', () => {
    expect(niceTicks(1500)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(1580)).toEqual([0, 500, 1000, 1500, 2000]);
    expect(niceTicks(90)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});
