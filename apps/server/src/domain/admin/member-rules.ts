import type { MembershipStatus, Role } from '../../generated/prisma/enums.js';
import { rolesCallerCannotGrant } from '../roles/roles.js';

export interface Caller {
  membershipId: string;
  roles: readonly Role[];
}

export interface Target {
  membershipId: string;
  roles: readonly Role[];
  status: MembershipStatus;
}

export type MemberRuleProblem =
  | { code: 'ADMIN_ONLY'; message: string }
  | { code: 'LAST_ADMIN'; message: string }
  | { code: 'CANNOT_DEACTIVATE_SELF'; message: string };

const isAdmin = (roles: readonly Role[]) => roles.includes('SYSTEM_ADMIN');

/**
 * Whether the caller may set a member's roles. Granting or removing the
 * administrator role is for administrators only, and the organisation must
 * keep at least one active administrator.
 */
export function roleChangeProblem(
  caller: Caller,
  target: Target,
  nextRoles: readonly Role[],
  activeAdmins: number,
): MemberRuleProblem | null {
  const added = nextRoles.filter((r) => !target.roles.includes(r));
  const removed = target.roles.filter((r) => !nextRoles.includes(r));
  const forbidden = rolesCallerCannotGrant(caller.roles, [
    ...added,
    ...removed,
  ]);
  if (forbidden.length) {
    return {
      code: 'ADMIN_ONLY',
      message: `Only a system administrator can grant or remove: ${forbidden.join(', ')}.`,
    };
  }
  if (
    target.status === 'ACTIVE' &&
    removed.includes('SYSTEM_ADMIN') &&
    activeAdmins <= 1
  ) {
    return {
      code: 'LAST_ADMIN',
      message:
        'This is the last active system administrator. Make someone else an administrator first.',
    };
  }
  return null;
}

/** Whether the caller may deactivate a member. */
export function deactivationProblem(
  caller: Caller,
  target: Target,
  activeAdmins: number,
): MemberRuleProblem | null {
  if (caller.membershipId === target.membershipId) {
    return {
      code: 'CANNOT_DEACTIVATE_SELF',
      message: 'You cannot deactivate yourself. Ask another administrator.',
    };
  }
  if (isAdmin(target.roles) && !isAdmin(caller.roles)) {
    return {
      code: 'ADMIN_ONLY',
      message: 'Only a system administrator can deactivate an administrator.',
    };
  }
  if (
    isAdmin(target.roles) &&
    target.status === 'ACTIVE' &&
    activeAdmins <= 1
  ) {
    return {
      code: 'LAST_ADMIN',
      message: 'This is the last active system administrator.',
    };
  }
  return null;
}

/** Whether the caller may change anything about a member (administrators: administrators only). */
export function canEditMember(caller: Caller, target: Target): boolean {
  return !isAdmin(target.roles) || isAdmin(caller.roles);
}

/**
 * True when moving `departmentId` under `newParentId` would put it inside
 * itself (directly or through its descendants).
 */
export function wouldCreateCycle(
  departments: readonly { id: string; parentId: string | null }[],
  departmentId: string,
  newParentId: string | null,
): boolean {
  const parentOf = new Map(departments.map((d) => [d.id, d.parentId]));
  for (let node = newParentId; node; node = parentOf.get(node) ?? null) {
    if (node === departmentId) return true;
  }
  return false;
}
