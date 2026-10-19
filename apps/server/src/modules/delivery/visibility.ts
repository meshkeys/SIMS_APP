import type { Prisma } from '../../generated/prisma/client.js';
import { canSeeInitiative } from '../../domain/access/initiative-visibility.js';
import type { AuthContext } from '../auth/index.js';

/** True when the viewer sees sensitive initiatives too (no filtering needed). */
export function seesAllInitiatives(viewer: AuthContext): boolean {
  return canSeeInitiative(viewer, {
    isSensitive: true,
    ownerId: null,
    sponsorId: null,
    benefitsOwnerId: null,
  });
}

/**
 * Prisma filter for initiatives the viewer may see: everything for those
 * who see sensitive work, otherwise non-sensitive ones plus their own.
 */
export function visibleInitiativeWhere(
  viewer: AuthContext,
): Prisma.InitiativeWhereInput {
  if (seesAllInitiatives(viewer)) return {};
  return {
    OR: [
      { isSensitive: false },
      { ownerId: viewer.membershipId },
      { sponsorId: viewer.membershipId },
      { benefitsOwnerId: viewer.membershipId },
    ],
  };
}
