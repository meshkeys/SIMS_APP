import type {
  Health,
  MilestoneStatus,
} from '../../../src/generated/prisma/enums.js';

/** The demo's "today": the snapshot date shown in the wireframes. */
export const AS_OF = new Date('2026-10-16T09:00:00Z');

const DAY_MS = 86_400_000;

/** A calendar date (stored in @db.Date columns) from "YYYY-MM-DD". */
export const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

export const addDays = (from: Date, days: number): Date =>
  new Date(from.getTime() + days * DAY_MS);

export const daysAgo = (days: number): Date => addDays(AS_OF, -days);

export const atTime = (iso: string, time: string): Date =>
  new Date(`${iso}T${time}:00Z`);

/** Last day of the month containing `d` (UTC). */
export const endOfMonth = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));

export { uuidv7 } from '../../../src/common/ids/uuidv7.js';

/** Splits an integer total by shares; rounding remainder goes to the last share. */
export function allocate(total: number, shares: readonly number[]): number[] {
  const sum = shares.reduce((a, b) => a + b, 0);
  const parts = shares.map((share) => Math.floor((total * share) / sum));
  parts[parts.length - 1] += total - parts.reduce((a, b) => a + b, 0);
  return parts;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface MilestoneSeed {
  title: string;
  weight: number;
  isCritical?: boolean;
  baselineStartDate: Date;
  baselineDate: Date;
  forecastDate?: Date;
  actualDate?: Date;
  verifiedCompletion: number;
  claimedCompletion?: number;
  status: MilestoneStatus;
}

export const statusFor = (completion: number): MilestoneStatus =>
  completion >= 100
    ? 'COMPLETE'
    : completion > 0
      ? 'IN_PROGRESS'
      : 'NOT_STARTED';

const PHASES = [
  ['Mobilisation and design', 15, 0.15],
  ['Build', 35, 0.5],
  ['Pilot and testing', 30, 0.8],
  ['Roll-out and handover', 20, 1],
] as const;

/**
 * Four standard phases whose verified completion adds up to exactly
 * `progress` (filled in order). Behind-plan initiatives get slipped forecasts.
 */
export function generateMilestones(spec: {
  start: Date;
  end: Date;
  progress: number;
  health: Health;
}): MilestoneSeed[] {
  const span = spec.end.getTime() - spec.start.getTime();
  const slipDays =
    spec.health === 'RED' ? 45 : spec.health === 'AMBER' ? 14 : 0;
  let remaining = spec.progress;
  let phaseStart = spec.start;

  return PHASES.map(([title, weight, endFraction]) => {
    const completion = round2(
      Math.min(100, Math.max(0, (remaining / weight) * 100)),
    );
    remaining -= (weight * completion) / 100;
    const baselineDate = new Date(
      Math.floor((spec.start.getTime() + span * endFraction) / 86_400_000) *
        86_400_000,
    );
    const status = statusFor(completion);
    const milestone: MilestoneSeed = {
      title,
      weight,
      baselineStartDate: phaseStart,
      baselineDate,
      verifiedCompletion: completion,
      claimedCompletion: completion,
      status,
    };
    if (status === 'COMPLETE') {
      milestone.actualDate =
        baselineDate < AS_OF ? baselineDate : addDays(AS_OF, -5);
    } else if (slipDays > 0) {
      milestone.forecastDate = addDays(baselineDate, slipDays);
    }
    phaseStart = baselineDate;
    return milestone;
  });
}
