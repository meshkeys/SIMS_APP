import type { Role, SessionView } from '@sims/contracts';

/**
 * True when the user holds any of the roles. Used to show or hide actions;
 * the server enforces the same lists, so hiding is a courtesy, not security.
 */
export const hasAnyRole = (session: SessionView, roles: readonly Role[]) =>
  session.membership.roles.some((role) => roles.includes(role));
