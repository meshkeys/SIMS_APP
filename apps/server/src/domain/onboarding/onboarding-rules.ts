import { ONBOARDING_STEPS, type OnboardingStep } from '@sims/contracts';

const PLAN_YEARS = 3;

/**
 * The first plan's period, until the vision step sets it: three financial
 * years from the start of the current one. Dates are calendar days (UTC).
 */
export function defaultPlanPeriod(
  fiscalYearStartMonth: number,
  today: Date,
): { name: string; startDate: Date; endDate: Date } {
  const month = fiscalYearStartMonth - 1;
  const year =
    today.getUTCMonth() >= month
      ? today.getUTCFullYear()
      : today.getUTCFullYear() - 1;
  const startDate = new Date(Date.UTC(year, month, 1));
  // The day before the same month, PLAN_YEARS later.
  const endDate = new Date(Date.UTC(year + PLAN_YEARS, month, 0));
  const endYear = endDate.getUTCFullYear();
  return {
    name: `Strategic plan ${year}–${endYear}`,
    startDate,
    endDate,
  };
}

/** "Budget code" → "budget_code"; "Q3 / Funding source!" → "q3_funding_source". */
export function customFieldKey(label: string): string {
  const key = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  return key || 'field';
}

/**
 * Steps not saved yet. The step counter only moves forward, but the plan is
 * what the framework step really produces, so it is checked directly. The
 * team step is optional and never "missing".
 */
export function missingSteps(step: number, hasPlan: boolean): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((name, index) => {
    if (name === 'team') return false;
    if (name === 'framework') return !hasPlan;
    return step < index + 1;
  });
}
