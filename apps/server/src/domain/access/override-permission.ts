import type { Role } from '../../generated/prisma/enums.js';

/**
 * Seniority for "who may override health". Roles outside the delivery chain
 * (System Admin — technical; Internal Audit — must stay independent) never
 * qualify, whatever the configured minimum.
 */
const OVERRIDE_RANK: Partial<Record<Role, number>> = {
  TASK_OWNER: 1,
  INITIATIVE_OWNER: 2,
  EXECUTIVE_SPONSOR: 3,
  STRATEGY_OFFICE: 4,
  CEO: 5,
  BOARD: 5,
};

/** Roles at or above this rank may override any initiative. */
const ORGANISATION_WIDE_RANK = 4;

export interface OverrideCaller {
  membershipId: string;
  roles: readonly Role[];
}

/**
 * May this person override this initiative's health?
 * - They need a role at or above the organisation's configured minimum.
 * - Strategy Office, CEO and Board may override any initiative.
 * - Owners and sponsors only their own: an Executive Sponsor cannot
 *   overrule the status of an initiative someone else sponsors.
 */
export function canOverrideHealth(
  caller: OverrideCaller,
  initiative: { ownerId: string | null; sponsorId: string | null },
  minimumRole: Role,
): boolean {
  const minimum = OVERRIDE_RANK[minimumRole];
  if (minimum === undefined) return false;

  return caller.roles.some((role) => {
    const rank = OVERRIDE_RANK[role];
    if (rank === undefined || rank < minimum) return false;
    if (rank >= ORGANISATION_WIDE_RANK) return true;
    if (role === 'EXECUTIVE_SPONSOR')
      return initiative.sponsorId === caller.membershipId;
    return initiative.ownerId === caller.membershipId;
  });
}
