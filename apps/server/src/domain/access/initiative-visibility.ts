import type { Role } from '../../generated/prisma/enums.js';

/** Roles that see every initiative, including sensitive ones. */
const SEE_ALL_ROLES: readonly Role[] = [
  'STRATEGY_OFFICE',
  'CEO',
  'SYSTEM_ADMIN',
  'INTERNAL_AUDIT',
];

export interface Viewer {
  membershipId: string;
  roles: readonly Role[];
}

export interface InitiativeAccessFacts {
  isSensitive: boolean;
  ownerId: string | null;
  sponsorId: string | null;
  benefitsOwnerId: string | null;
}

/**
 * Sensitive initiatives (restructuring, acquisitions, branch closures…) are
 * visible only to the Strategy Office, CEO, administrators, internal audit,
 * and the people directly accountable for them. Everyone else — including
 * the Board — sees them only inside pillar-level totals.
 */
export function canSeeInitiative(
  viewer: Viewer,
  initiative: InitiativeAccessFacts,
): boolean {
  if (!initiative.isSensitive) return true;
  if (viewer.roles.some((role) => SEE_ALL_ROLES.includes(role))) return true;
  return [
    initiative.ownerId,
    initiative.sponsorId,
    initiative.benefitsOwnerId,
  ].includes(viewer.membershipId);
}
