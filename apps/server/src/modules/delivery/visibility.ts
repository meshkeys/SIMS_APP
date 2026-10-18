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
