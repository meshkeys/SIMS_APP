/**
 * Turns audit events into the one-line sentences of the "Activity & audit
 * trail" panel. Unknown actions fall back to a readable form of their name,
 * so new event types never break the screen.
 */

export interface AuditEventLike {
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
}

type Json = Record<string, unknown> | null;

const HEALTH_WORDS: Record<string, string> = {
  GREEN: 'Green',
  AMBER: 'Amber',
  RED: 'Red',
  UNKNOWN: 'Unknown',
};

const shortDate = (iso: unknown) =>
  typeof iso === 'string'
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }).format(new Date(iso))
    : '';

const humanise = (action: string) =>
  action.charAt(0) + action.slice(1).toLowerCase().replace(/_/g, ' ');

export function describeActivity(
  event: AuditEventLike,
  milestoneTitles: ReadonlyMap<string, string>,
): string {
  const before = event.before as Json;
  const after = event.after as Json;
  const milestone = milestoneTitles.get(event.entityId);

  switch (event.action) {
    case 'STATUS_OVERRIDE':
      return `Status overridden ${HEALTH_WORDS[String(before?.health)] ?? '—'} → ${HEALTH_WORDS[String(after?.health)] ?? '—'} with reason`;
    case 'OVERRIDE_REMOVED':
      return 'Status override removed';
    case 'UPDATE_SUBMITTED': {
      const verified = after?.verifiedProgress;
      const claimed = after?.claimedProgress;
      if (
        typeof verified === 'number' &&
        typeof claimed === 'number' &&
        claimed !== verified
      ) {
        return `Update submitted: ${verified}% (claimed ${claimed}%, ${claimed - verified} pp not verified)`;
      }
      return `Update submitted${typeof claimed === 'number' ? `: ${claimed}%` : ''}`;
    }
    case 'RECOVERY_PLAN_REQUESTED':
      return 'Strategy Office requested a recovery plan';
    case 'EVIDENCE_UPLOADED':
      return `Evidence uploaded for ${milestone ?? 'a milestone'}`;
    case 'MILESTONE_FORECAST_CHANGED':
      return `Forecast for ${milestone ?? 'a milestone'} moved ${shortDate(before?.forecastDate)} → ${shortDate(after?.forecastDate)}`;
    default:
      return milestone
        ? `${humanise(event.action)}: ${milestone}`
        : humanise(event.action);
  }
}
