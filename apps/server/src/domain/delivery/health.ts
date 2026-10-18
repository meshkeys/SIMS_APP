import type { Health } from '../../generated/prisma/enums.js';
import type { RulesetConfig } from '../rulesets/ruleset-config.js';
import { daysBetween } from './progress.js';

/**
 * The health rules engine. Turns facts about an initiative into a RAG status
 * plus the reasons behind it ("Why this status?"), using the organisation's
 * ruleset. Pure: same facts and rules, same answer — so it can run in
 * requests, background jobs, the seed and the admin "impact preview" alike.
 *
 * Order of evaluation:
 *   1. Base band from percentage points behind plan (Green / Amber / Red).
 *   2. Caps: an open critical issue, or a long-blocked dependency, means the
 *      best possible status is Amber (they never improve a worse status).
 *   3. Force: an overdue critical milestone makes it Red, whatever else is true.
 *   4. Unknown: no update in the last locked period means progress figures are
 *      stale, so the status is Unknown — unless Red was forced by a hard fact.
 *
 * Separately, an update that is past its deadline in the current (open)
 * period is flagged but does not change the status: the owner may still
 * submit, and the figures are visibly marked as not fresh. Planned progress
 * keeps rising meanwhile, so a silent initiative drifts towards Amber/Red —
 * it never looks better than it is.
 */

export type HealthRule =
  | 'PROGRESS_VS_PLAN'
  | 'OPEN_CRITICAL_ISSUE'
  | 'BLOCKED_DEPENDENCY'
  | 'OVERDUE_CRITICAL_MILESTONE'
  | 'MISSED_UPDATE'
  | 'UPDATE_OVERDUE';

/** FLAG: shown to people, but does not change the status. */
export type HealthEffect =
  'BASE' | 'CAP_AMBER' | 'FORCE_RED' | 'UNKNOWN' | 'FLAG';

export interface HealthReason {
  rule: HealthRule;
  effect: HealthEffect;
  /** The status this rule points to on its own. */
  result: Health;
  /** Plain-language explanation for the "Why this status?" panel. */
  detail: string;
}

export interface HealthFacts {
  plannedProgress: number;
  verifiedProgress: number;
  criticalMilestones: {
    title: string;
    baselineDate: Date;
    complete: boolean;
  }[];
  openCriticalIssues: { title: string }[];
  /** Dependencies this initiative waits on that are currently blocked. */
  blockedDependencies: {
    title: string;
    blockedSince: Date;
    isCriticalPath: boolean;
  }[];
  /** Set when the most recent locked period has no update from this initiative. */
  missedUpdate: { periodName: string } | null;
  /** Set when the open period's submission deadline has passed with no update yet. */
  overdueUpdate: { periodName: string; dueAt: Date } | null;
  /** The moment of evaluation (deadlines are compared to the minute). */
  today: Date;
}

export interface HealthResult {
  health: Health;
  /** Percentage points behind plan (negative = ahead). */
  ppBehind: number;
  reasons: HealthReason[];
  /** The open period's update is late: show "Update overdue" next to the status. */
  updateOverdue: { periodName: string; daysOverdue: number } | null;
}

const SEVERITY: Record<Exclude<Health, 'UNKNOWN'>, number> = {
  GREEN: 0,
  AMBER: 1,
  RED: 2,
};
const worst = (a: 'GREEN' | 'AMBER' | 'RED', b: 'GREEN' | 'AMBER' | 'RED') =>
  SEVERITY[a] >= SEVERITY[b] ? a : b;

const pp = (n: number) => `${Number(Math.abs(n).toFixed(1))} pp`;
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const andMore = (count: number) =>
  count > 1 ? ` (and ${count - 1} more)` : '';

export function calculateHealth(
  facts: HealthFacts,
  rules: RulesetConfig,
): HealthResult {
  const { greenMaxPpBehind, amberMaxPpBehind } = rules.rag;
  const modifiers = rules.healthModifiers;
  const reasons: HealthReason[] = [];

  // 1. Base band.
  const ppBehind =
    Math.round((facts.plannedProgress - facts.verifiedProgress) * 100) / 100;
  const base =
    ppBehind <= greenMaxPpBehind
      ? 'GREEN'
      : ppBehind <= amberMaxPpBehind
        ? 'AMBER'
        : 'RED';
  reasons.push({
    rule: 'PROGRESS_VS_PLAN',
    effect: 'BASE',
    result: base,
    detail:
      ppBehind > 0
        ? `${pp(ppBehind)} behind plan (Green up to ${greenMaxPpBehind} pp, Amber up to ${amberMaxPpBehind} pp)`
        : ppBehind < 0
          ? `${pp(ppBehind)} ahead of plan`
          : 'On plan',
  });
  let health: 'GREEN' | 'AMBER' | 'RED' = base;

  // 2. Caps at Amber.
  if (
    modifiers.openCriticalIssueCapsAtAmber &&
    facts.openCriticalIssues.length > 0
  ) {
    health = worst(health, 'AMBER');
    reasons.push({
      rule: 'OPEN_CRITICAL_ISSUE',
      effect: 'CAP_AMBER',
      result: 'AMBER',
      detail: `Open critical issue: "${facts.openCriticalIssues[0].title}"${andMore(facts.openCriticalIssues.length)}`,
    });
  }

  const dependencyRule = modifiers.blockedDependencyCapsAtAmber;
  if (dependencyRule.enabled) {
    const longBlocked = facts.blockedDependencies
      .filter((d) => !dependencyRule.criticalPathOnly || d.isCriticalPath)
      .map((d) => ({
        ...d,
        daysBlocked: daysBetween(d.blockedSince, facts.today),
      }))
      .filter((d) => d.daysBlocked >= dependencyRule.minDaysBlocked)
      .sort((a, b) => b.daysBlocked - a.daysBlocked);
    if (longBlocked.length > 0) {
      health = worst(health, 'AMBER');
      reasons.push({
        rule: 'BLOCKED_DEPENDENCY',
        effect: 'CAP_AMBER',
        result: 'AMBER',
        detail: `Blocked for ${days(longBlocked[0].daysBlocked)} by ${longBlocked[0].title}${andMore(longBlocked.length)}`,
      });
    }
  }

  // 3. Forced Red.
  let forcedRed = false;
  if (modifiers.overdueCriticalMilestoneForcesRed) {
    const overdue = facts.criticalMilestones
      .filter((m) => !m.complete)
      .map((m) => ({
        ...m,
        daysLate: daysBetween(m.baselineDate, facts.today),
      }))
      .filter((m) => m.daysLate > 0)
      .sort((a, b) => b.daysLate - a.daysLate);
    if (overdue.length > 0) {
      forcedRed = true;
      health = 'RED';
      reasons.push({
        rule: 'OVERDUE_CRITICAL_MILESTONE',
        effect: 'FORCE_RED',
        result: 'RED',
        detail: `Critical milestone "${overdue[0].title}" overdue by ${days(overdue[0].daysLate)}${andMore(overdue.length)}`,
      });
    }
  }

  // 4. Unknown when the figures are stale.
  let final: Health = health;
  if (modifiers.missedUpdateMakesUnknown && facts.missedUpdate) {
    reasons.push({
      rule: 'MISSED_UPDATE',
      effect: 'UNKNOWN',
      result: 'UNKNOWN',
      detail: `No update submitted for ${facts.missedUpdate.periodName}`,
    });
    if (!forcedRed) final = 'UNKNOWN';
  }

  // Flag only (no status change): this period's update is past its deadline.
  let updateOverdue: HealthResult['updateOverdue'] = null;
  const overdue = facts.overdueUpdate;
  if (overdue && facts.today.getTime() > overdue.dueAt.getTime()) {
    const daysOverdue = daysBetween(overdue.dueAt, facts.today);
    const due = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(overdue.dueAt);
    updateOverdue = { periodName: overdue.periodName, daysOverdue };
    reasons.push({
      rule: 'UPDATE_OVERDUE',
      effect: 'FLAG',
      result: final,
      detail:
        daysOverdue > 0
          ? `${overdue.periodName} update overdue by ${days(daysOverdue)} (due ${due}); figures are from the last update`
          : `${overdue.periodName} update overdue since today; figures are from the last update`,
    });
  }

  return { health: final, ppBehind, reasons, updateOverdue };
}

/**
 * What screens and reports show: a manual override while it is valid,
 * otherwise the calculated status.
 */
export function effectiveHealth(
  initiative: {
    calculatedHealth: Health;
    healthOverride: Health | null;
    overrideExpiresAt: Date | null;
  },
  now: Date,
): { health: Health; overridden: boolean } {
  const overrideActive =
    initiative.healthOverride !== null &&
    initiative.overrideExpiresAt !== null &&
    initiative.overrideExpiresAt.getTime() > now.getTime();
  return overrideActive
    ? { health: initiative.healthOverride!, overridden: true }
    : { health: initiative.calculatedHealth, overridden: false };
}
