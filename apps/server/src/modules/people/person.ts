import { BadRequestException } from '@nestjs/common';
import type { TenantTransactionClient } from '../../infrastructure/database/index.js';
import type { PersonRef } from '@sims/contracts';

/** Prisma `select` that yields everything `toPersonRef` needs. */
export const personSelect = {
  select: { id: true, jobTitle: true, user: { select: { name: true } } },
} as const;

export function toPersonRef(
  membership: {
    id: string;
    jobTitle: string | null;
    user: { name: string };
  } | null,
): PersonRef | null {
  return membership
    ? {
        membershipId: membership.id,
        name: membership.user.name,
        jobTitle: membership.jobTitle,
      }
    : null;
}

/**
 * Checks that membership ids given as owner/sponsor belong to active members
 * of the current organisation.
 *
 * Required: these columns are plain foreign keys, and Postgres checks foreign
 * keys without row-level security — so without this check a request could
 * point at another tenant's member. Row-level security makes such ids
 * invisible here, so they are rejected like unknown ones.
 */
export async function assertActiveMembers(
  tx: TenantTransactionClient,
  fields: Record<string, string | null | undefined>,
): Promise<void> {
  const entries = Object.entries(fields).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  if (entries.length === 0) return;

  const found = await tx.membership.findMany({
    where: { id: { in: entries.map(([, id]) => id) }, status: 'ACTIVE' },
    select: { id: true },
  });
  const known = new Set(found.map((m) => m.id));
  const errors = entries
    .filter(([, id]) => !known.has(id))
    .map(([path]) => ({
      path,
      message: 'Choose an active member of your organisation',
      code: 'not_found',
    }));
  if (errors.length) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Some fields are missing or invalid.',
      errors,
    });
  }
}
