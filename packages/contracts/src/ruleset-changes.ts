import { ROLE_LABELS } from './roles.js';
import type { RulesetConfig } from './rulesets.js';

const days = (n: number | null) =>
  n === null ? 'by decision only' : n === 1 ? '1 day' : `${n} days`;
const onOff = (on: boolean) => (on ? 'on' : 'off');
const decider = (
  d: RulesetConfig['escalation']['levels'][number]['decidedBy'],
) =>
  d.type === 'ROLE'
    ? ROLE_LABELS[d.role]
    : d.type === 'INITIATIVE_OWNER'
      ? 'Initiative owner'
      : 'Initiative sponsor';

/**
 * A rule change in plain words, one line per setting that differs:
 * "Green up to: 5 pp → 6 pp". Shared so the decision the MD/CEO approves
 * and the Administration screen describe a change identically.
 */
export function describeRulesetChanges(
  before: RulesetConfig,
  after: RulesetConfig,
): string[] {
  const lines: string[] = [];
  const add = (label: string, a: string, b: string) => {
    if (a !== b) lines.push(`${label}: ${a} → ${b}`);
  };

  add(
    'Green up to',
    `${before.rag.greenMaxPpBehind} pp`,
    `${after.rag.greenMaxPpBehind} pp`,
  );
  add(
    'Amber up to',
    `${before.rag.amberMaxPpBehind} pp`,
    `${after.rag.amberMaxPpBehind} pp`,
  );

  const m = (c: RulesetConfig) => c.healthModifiers;
  add(
    'Overdue critical milestone forces Red',
    onOff(m(before).overdueCriticalMilestoneForcesRed),
    onOff(m(after).overdueCriticalMilestoneForcesRed),
  );
  add(
    'Open critical issue caps at Amber',
    onOff(m(before).openCriticalIssueCapsAtAmber),
    onOff(m(after).openCriticalIssueCapsAtAmber),
  );
  const blocked = (c: RulesetConfig) => {
    const b = m(c).blockedDependencyCapsAtAmber;
    return b.enabled
      ? `on, after ${days(b.minDaysBlocked)}${b.criticalPathOnly ? ', critical path only' : ''}`
      : 'off';
  };
  add('Blocked dependency caps at Amber', blocked(before), blocked(after));
  add(
    'Missed update makes health Unknown',
    onOff(m(before).missedUpdateMakesUnknown),
    onOff(m(after).missedUpdateMakesUnknown),
  );

  add(
    'Overrides expire after',
    days(before.overrides.expiryDays),
    days(after.overrides.expiryDays),
  );
  add(
    'Who can override',
    `${ROLE_LABELS[before.overrides.minimumRole]} or above`,
    `${ROLE_LABELS[after.overrides.minimumRole]} or above`,
  );

  const ladder = (c: RulesetConfig) =>
    c.escalation.levels
      .map(
        (l) =>
          `L${l.level} ${l.name} (${decider(l.decidedBy)}, ${l.level === 1 ? 'when raised' : `after ${days(l.autoEscalateAfterDays)}`})`,
      )
      .join('; ');
  add('Escalation ladder', ladder(before), ladder(after));
  add(
    'Critical items start at',
    before.escalation.criticalStartsAtLevel
      ? `L${before.escalation.criticalStartsAtLevel}`
      : 'L1',
    after.escalation.criticalStartsAtLevel
      ? `L${after.escalation.criticalStartsAtLevel}`
      : 'L1',
  );

  const cycle = (c: RulesetConfig) => {
    const r = c.reportingCycle;
    return `${r.cadence.toLowerCase()}; submit days ${r.ownerSubmission.fromDay}–${r.ownerSubmission.toDay}, review ${r.strategyReview.fromDay}–${r.strategyReview.toDay}, sponsor ${r.sponsorReview.fromDay}–${r.sponsorReview.toDay}, report day ${r.reportIssueDay}`;
  };
  add('Reporting cycle', cycle(before), cycle(after));
  add(
    'Reminders (working days before the deadline)',
    before.reportingCycle.reminderDaysBeforeDue.join(', ') || 'none',
    after.reportingCycle.reminderDaysBeforeDue.join(', ') || 'none',
  );

  add(
    'Low-value threshold',
    `${before.impact.lowValueThresholdPct}%`,
    `${after.impact.lowValueThresholdPct}%`,
  );
  add(
    'KPI on trajectory from',
    `${before.impact.onTrajectoryMinPct}%`,
    `${after.impact.onTrajectoryMinPct}%`,
  );
  add(
    'KPI slightly behind from',
    `${before.impact.slightlyBehindMinPct}%`,
    `${after.impact.slightlyBehindMinPct}%`,
  );
  return lines;
}
