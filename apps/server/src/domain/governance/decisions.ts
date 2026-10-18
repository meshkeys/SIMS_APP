import type {
  ApprovalType,
  DecisionOutcome,
  Role,
} from '../../generated/prisma/enums.js';

/** Who must approve each kind of change request. */
export const CHANGE_APPROVER: Record<
  'BASELINE_CHANGE' | 'BUDGET_CHANGE' | 'SCOPE_CHANGE',
  'CEO' | 'SPONSOR'
> = {
  // Moving dates or the milestone plan changes what the Board was promised.
  BASELINE_CHANGE: 'CEO',
  // Money and scope sit with the executive accountable for the initiative.
  BUDGET_CHANGE: 'SPONSOR',
  SCOPE_CHANGE: 'SPONSOR',
};

export interface DecisionFacts {
  requiredFrom: Role;
  requiredFromId: string | null;
  /** Set for change requests: the requester can never approve their own request. */
  requestedById: string | null;
  isChangeRequest: boolean;
}

export type DecideRight = 'DECIDER' | 'ON_BEHALF' | null;

/**
 * May this person record the decision?
 * - The named decision owner, or (when nobody is named) anyone holding the
 *   required role, decides.
 * - The Strategy Office may record other decisions on the decider's behalf
 *   (e.g. an EXCO resolution) — flagged as such.
 * - Change requests are maker-checker: only the approver decides, and never
 *   the person who asked for the change.
 */
export function decideRight(
  caller: { membershipId: string; roles: readonly Role[] },
  decision: DecisionFacts,
): DecideRight {
  if (
    decision.isChangeRequest &&
    decision.requestedById === caller.membershipId
  )
    return null;
  const named = decision.requiredFromId === caller.membershipId;
  const roleHolder =
    !decision.requiredFromId && caller.roles.includes(decision.requiredFrom);
  if (named || roleHolder) return 'DECIDER';
  if (!decision.isChangeRequest && caller.roles.includes('STRATEGY_OFFICE'))
    return 'ON_BEHALF';
  return null;
}

/** Still needs a decision: pending, or deferred to a date that has arrived. */
export function isOpen(
  decision: { outcome: DecisionOutcome; deferredUntil: Date | null },
  today: Date,
): boolean {
  if (decision.outcome === 'PENDING') return true;
  return (
    decision.outcome === 'DEFERRED' &&
    decision.deferredUntil !== null &&
    decision.deferredUntil <= today
  );
}

/** Next reference in a series: CR-0142 → CR-0143; DEC-0001 for a new series. */
export function nextReference(
  prefix: string,
  existing: readonly string[],
): string {
  const highest = existing.reduce((max, reference) => {
    const match = reference.match(new RegExp(`^${prefix}-(\\d+)$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(4, '0')}`;
}

export const CHANGE_REQUEST_TYPES = [
  'BASELINE_CHANGE',
  'BUDGET_CHANGE',
  'SCOPE_CHANGE',
] as const satisfies readonly ApprovalType[];
