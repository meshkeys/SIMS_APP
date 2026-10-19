import { type EscalationItem, ROLE_LABELS } from '@sims/contracts';
import { SEVERITY_DISPLAY } from '@/lib/health';

/** The line under an escalation's title: what kind of problem it is. */
export function escalationKind(item: EscalationItem): string {
  const severity = SEVERITY_DISPLAY[item.severity].label.toLowerCase();
  switch (item.source) {
    case 'RISK_ISSUE':
      return `${item.riskIssue?.type === 'RISK' ? 'Risk' : 'Issue'} · ${severity}`;
    case 'RESOURCE_CONFLICT':
      return 'Resource conflict';
    case 'MISSING_KPI_ACTUALS':
      return 'Accountability';
    case 'MISSED_UPDATE':
      return 'Update overdue';
    case 'DEPENDENCY':
      return 'Blocked dependency';
    default:
      return `Raised · ${severity}`;
  }
}

/** Who must decide: the named person's title or name, else the role. */
export function deciderLabel(item: EscalationItem): string {
  if (item.decisionFrom)
    return item.decisionFrom.jobTitle ?? item.decisionFrom.name;
  return item.decisionFromRole ? ROLE_LABELS[item.decisionFromRole] : '—';
}

/** Age colour: a week at the ladder is a warning, two weeks is late. */
export function ageTone(days: number): string {
  if (days >= 14) return 'font-semibold text-danger';
  if (days >= 7) return 'font-semibold text-warning';
  return 'text-ink';
}
