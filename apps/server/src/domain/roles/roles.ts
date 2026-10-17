import type { Role } from '../../generated/prisma/enums.js';

/** Human-readable role names, used in emails and (later) the web app. */
export const ROLE_LABELS: Record<Role, string> = {
  BOARD: 'Board member',
  CEO: 'MD/CEO',
  STRATEGY_OFFICE: 'Strategy Office',
  EXECUTIVE_SPONSOR: 'Executive sponsor',
  INITIATIVE_OWNER: 'Initiative owner',
  TASK_OWNER: 'Task owner',
  SYSTEM_ADMIN: 'System administrator',
  INTERNAL_AUDIT: 'Internal audit',
};

/** Roles that may invite people into an organisation. */
export const INVITER_ROLES = [
  'SYSTEM_ADMIN',
  'STRATEGY_OFFICE',
] as const satisfies readonly Role[];

/**
 * Roles only a System Administrator can hand out. Stops anyone with invite
 * rights from creating a new administrator (privilege escalation).
 */
export const ADMIN_ONLY_ROLES: readonly Role[] = ['SYSTEM_ADMIN'];

/** Returns the roles in `requested` that `callerRoles` is not allowed to grant. */
export function rolesCallerCannotGrant(
  callerRoles: readonly Role[],
  requested: readonly Role[],
): Role[] {
  if (callerRoles.includes('SYSTEM_ADMIN')) return [];
  return requested.filter((role) => ADMIN_ONLY_ROLES.includes(role));
}
