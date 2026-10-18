/**
 * Execution progress of an initiative, from its milestones.
 *
 *   verified completion = Σ(weight × verified completion) ÷ Σ weight
 *   planned completion  = Σ(weight × share of the milestone's planned window
 *                           elapsed at a date) ÷ Σ weight
 *
 * Milestones with weight 0 (e.g. a contract signature that gates work but is
 * not work itself) affect health rules, not completion.
 */

const DAY_MS = 86_400_000;

export interface MilestoneProgressFacts {
  weight: number;
  verifiedCompletion: number;
  /** When planned work on the milestone starts; falls back to the initiative start. */
  baselineStartDate: Date | null;
  /** Approved due date. */
  baselineDate: Date;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Start of the UTC calendar day, so planned progress is stable within a day. */
export const startOfUtcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export const daysBetween = (from: Date, to: Date): number =>
  Math.round(
    (startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / DAY_MS,
  );

export function verifiedCompletion(
  milestones: readonly MilestoneProgressFacts[],
): number {
  const totalWeight = milestones.reduce((sum, m) => sum + m.weight, 0);
  if (totalWeight === 0) return 0;
  return round2(
    milestones.reduce((sum, m) => sum + m.weight * m.verifiedCompletion, 0) /
      totalWeight,
  );
}

/**
 * How complete the initiative should be on `at` if delivered to baseline:
 * each milestone is planned to progress evenly across its window.
 */
export function plannedCompletion(
  milestones: readonly MilestoneProgressFacts[],
  at: Date,
  initiativeStart: Date | null,
): number {
  const totalWeight = milestones.reduce((sum, m) => sum + m.weight, 0);
  if (totalWeight === 0) return 0;
  const day = startOfUtcDay(at).getTime();

  const planned = milestones.reduce((sum, milestone) => {
    if (milestone.weight === 0) return sum;
    const end = startOfUtcDay(milestone.baselineDate).getTime();
    const start = startOfUtcDay(
      milestone.baselineStartDate ?? initiativeStart ?? milestone.baselineDate,
    ).getTime();
    let share: number;
    if (day >= end) share = 1;
    else if (day <= start) share = 0;
    else share = (day - start) / (end - start);
    return sum + milestone.weight * share;
  }, 0);

  return round2((planned / totalWeight) * 100);
}
