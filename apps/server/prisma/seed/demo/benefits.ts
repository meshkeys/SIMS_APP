/**
 * Financial benefits, ₦ millions. Portfolio totals reproduce the
 * "Expected vs realised benefits" chart:
 *   expected  Q1 600 · Q2 900 · Q3 1,200 · Q4 1,500   (FY2026 ₦4.2bn)
 *   realised  Q1 520 · Q2 700 · Q3 680                  (₦1.9bn to date)
 *   forecast  Q4 900
 */
export const QUARTERS = [
  { label: 'Q1 2026', periodEnd: '2026-03-31', actualPeriod: 'March 2026' },
  { label: 'Q2 2026', periodEnd: '2026-06-30', actualPeriod: 'June 2026' },
  { label: 'Q3 2026', periodEnd: '2026-09-30', actualPeriod: 'September 2026' },
  { label: 'Q4 2026', periodEnd: '2026-12-31', actualPeriod: null },
] as const;

export const PORTFOLIO_EXPECTED = [600, 900, 1200, 1500];
export const PORTFOLIO_REALISED = [520, 700, 680];
export const PORTFOLIO_Q4_FORECAST = 900;

/** The Digital Investment Platform's own benefit, mostly landing in 2027. */
export const DIG_004_BENEFIT = {
  initiative: 'DIG-004',
  name: 'Investment platform revenue',
  expected: [0, 0, 50, 100],
  realised: [0, 0, 50],
  q4Forecast: 80,
  later: [
    { periodEnd: '2027-03-31', expected: 150 },
    { periodEnd: '2027-06-30', expected: 200 },
  ],
} as const;

/** Everything else is shared across these benefits by weight. */
export const SHARED_BENEFITS = [
  { initiative: 'REV-001', name: 'Advisory fee income', share: 14 },
  { initiative: 'REV-002', name: 'Institutional fee income', share: 18 },
  { initiative: 'REV-004', name: 'SME transaction income', share: 8 },
  { initiative: 'OPS-001', name: 'Operating cost savings', share: 20 },
  { initiative: 'OPS-003', name: 'Procurement savings', share: 14 },
  { initiative: 'DIG-002', name: 'Digital channel cost savings', share: 10 },
  { initiative: 'DIG-006', name: 'Mobile channel revenue', share: 6 },
  { initiative: 'REV-010', name: 'Agent banking fee income', share: 5 },
  { initiative: 'OPS-008', name: 'E-procurement savings', share: 5 },
] as const;

export const MILLION = 1_000_000;
