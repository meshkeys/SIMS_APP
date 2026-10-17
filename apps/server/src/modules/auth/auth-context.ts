import type { Role } from '../../generated/prisma/enums.js';

/**
 * Who is calling, as proven by a verified access token. Attached to the
 * request by the auth guard and read with `@CurrentAuth()`.
 */
export interface AuthContext {
  readonly userId: string;
  readonly organisationId: string;
  readonly membershipId: string;
  readonly roles: readonly Role[];
  /** Refresh-token family: one per sign-in, shared by its rotations. */
  readonly sessionId: string;
}
