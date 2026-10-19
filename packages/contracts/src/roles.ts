import type { Role } from './enums.js';

/** Human-readable role names, for emails and the web app. */
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

/** Roles that may change the strategic plan, its framework, elements and KPIs. */
export const STRATEGY_EDITOR_ROLES = [
  'STRATEGY_OFFICE',
  'SYSTEM_ADMIN',
] as const satisfies readonly Role[];

/**
 * Roles that may read issued report packs. Board members see packs written
 * for the Board only.
 */
export const REPORT_READER_ROLES = [
  'STRATEGY_OFFICE',
  'SYSTEM_ADMIN',
  'CEO',
  'EXECUTIVE_SPONSOR',
  'BOARD',
  'INTERNAL_AUDIT',
] as const satisfies readonly Role[];

/** Roles that may propose new initiatives. */
export const PROPOSER_ROLES = [
  'STRATEGY_OFFICE',
  'SYSTEM_ADMIN',
  'EXECUTIVE_SPONSOR',
  'INITIATIVE_OWNER',
] as const satisfies readonly Role[];

/**
 * Roles only a System Administrator can hand out. Stops anyone with invite
 * rights from creating a new administrator (privilege escalation).
 */
export const ADMIN_ONLY_ROLES: readonly Role[] = ['SYSTEM_ADMIN'];
