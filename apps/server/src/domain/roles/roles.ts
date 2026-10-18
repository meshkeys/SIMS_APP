import { ADMIN_ONLY_ROLES } from '@sims/contracts';
import type { Role } from '../../generated/prisma/enums.js';

// Role lists are part of the API contract (the web app shows and hides
// actions with them); they are re-exported here for the server's rules.
export {
  ADMIN_ONLY_ROLES,
  INVITER_ROLES,
  ROLE_LABELS,
  STRATEGY_EDITOR_ROLES,
} from '@sims/contracts';

/** Returns the roles in `requested` that `callerRoles` is not allowed to grant. */
export function rolesCallerCannotGrant(
  callerRoles: readonly Role[],
  requested: readonly Role[],
): Role[] {
  if (callerRoles.includes('SYSTEM_ADMIN')) return [];
  return requested.filter((role) => ADMIN_ONLY_ROLES.includes(role));
}
