import type { RulesetConfig } from '../rulesets/ruleset-config.js';

/**
 * Reporting-cycle dates. Stage windows are configured in working days
 * (Mon–Fri) from the day the cycle opens; each stage closes at the end of the
 * working day (17:00) in the organisation's own time zone.
 */

export const END_OF_DAY = '17:00';

/** Minutes the zone is ahead of UTC at a given instant (e.g. Lagos → +60). */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const value = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The instant of a local wall-clock time ("2026-10-12", "17:00") in a zone. */
export function zonedInstant(
  isoDate: string,
  time: string,
  timeZone: string,
): Date {
  const guess = new Date(`${isoDate}T${time}:00Z`);
  const first = new Date(
    guess.getTime() - offsetMinutes(guess, timeZone) * 60_000,
  );
  // Re-check once in case the guess sat on the other side of a DST change.
  return new Date(guess.getTime() - offsetMinutes(first, timeZone) * 60_000);
}

/** The calendar date ("YYYY-MM-DD") of an instant in a zone. */
export function zonedDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

const isWeekday = (isoDate: string) => {
  const day = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
};
const nextDay = (isoDate: string) =>
  new Date(new Date(`${isoDate}T12:00:00Z`).getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);

/** Working day N (1 = the opening day, or the next weekday if it opens at a weekend). */
export function workingDay(opensOn: string, n: number): string {
  let date = opensOn;
  while (!isWeekday(date)) date = nextDay(date);
  for (let count = 1; count < n; count++) {
    date = nextDay(date);
    while (!isWeekday(date)) date = nextDay(date);
  }
  return date;
}

export interface CycleDeadlines {
  submissionOpensAt: Date;
  submissionDueAt: Date;
  strategyReviewDueAt: Date;
  sponsorReviewDueAt: Date;
  reportIssueDueAt: Date;
}

export function cycleDeadlines(
  opensOn: string,
  cycle: RulesetConfig['reportingCycle'],
  timeZone: string,
): CycleDeadlines {
  const close = (day: number) =>
    zonedInstant(workingDay(opensOn, day), END_OF_DAY, timeZone);
  return {
    submissionOpensAt: zonedInstant(
      workingDay(opensOn, cycle.ownerSubmission.fromDay),
      '08:00',
      timeZone,
    ),
    submissionDueAt: close(cycle.ownerSubmission.toDay),
    strategyReviewDueAt: close(cycle.strategyReview.toDay),
    sponsorReviewDueAt: close(cycle.sponsorReview.toDay),
    reportIssueDueAt: close(cycle.reportIssueDay),
  };
}

/**
 * Which working day of the cycle `now` falls on ("Day 6 of 8"); 0 before the
 * cycle opens; capped at the last day.
 */
export function cycleDay(
  now: Date,
  submissionOpensAt: Date,
  totalDays: number,
  timeZone: string,
): number {
  const today = zonedDate(now, timeZone);
  const opens = zonedDate(submissionOpensAt, timeZone);
  if (today < opens) return 0;
  for (let n = 1; n <= totalDays; n++) {
    if (workingDay(opens, n) >= today) return n;
  }
  return totalDays;
}
