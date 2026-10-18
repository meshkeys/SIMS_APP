import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { canSeeInitiative } from '../../domain/access/initiative-visibility.js';
import {
  type InitiativeRelation,
  relationTo,
} from '../../domain/delivery/permissions.js';
import type { InitiativeStatus } from '../../generated/prisma/enums.js';
import type { TenantTransactionClient } from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';

export interface InitiativeForWrite {
  id: string;
  code: string;
  planId: string;
  status: InitiativeStatus;
  ownerId: string | null;
  sponsorId: string | null;
  benefitsOwnerId: string | null;
  isSensitive: boolean;
  baselineStart: Date | null;
  baselineEnd: Date | null;
  activatedAt: Date | null;
}

export const initiativeNotFound = () =>
  new NotFoundException({
    code: 'INITIATIVE_NOT_FOUND',
    message: 'Initiative not found.',
  });

export const notYourInitiative = () =>
  new ForbiddenException({
    code: 'NOT_ACCOUNTABLE',
    message:
      'Only the Strategy Office and this initiative’s owner or sponsor can change it.',
  });

export const baselineLocked = (what = 'The baseline') =>
  new ConflictException({
    code: 'BASELINE_LOCKED',
    message: `${what} is locked while the initiative is being delivered. Ask the Strategy Office to raise a change request.`,
  });

export const invalidField = (path: string, message: string) =>
  new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Some fields are missing or invalid.',
    errors: [{ path, message, code: 'custom' }],
  });

/**
 * Loads an initiative for a change, with the caller's relation to it.
 * Sensitive initiatives the caller may not see answer 404 (never revealed);
 * visible ones the caller is not accountable for answer 403.
 */
export async function loadForWrite(
  tx: TenantTransactionClient,
  caller: AuthContext,
  initiativeId: string,
  options: { requireRelation?: boolean } = { requireRelation: true },
): Promise<{ initiative: InitiativeForWrite; relation: InitiativeRelation }> {
  const initiative = await tx.initiative.findUnique({
    where: { id: initiativeId },
    select: {
      id: true,
      code: true,
      planId: true,
      status: true,
      ownerId: true,
      sponsorId: true,
      benefitsOwnerId: true,
      isSensitive: true,
      baselineStart: true,
      baselineEnd: true,
      activatedAt: true,
    },
  });
  if (!initiative || !canSeeInitiative(caller, initiative))
    throw initiativeNotFound();
  const relation = relationTo(caller, initiative);
  if (options.requireRelation !== false && relation === 'NONE')
    throw notYourInitiative();
  return { initiative, relation };
}

export async function assertDepartmentExists(
  tx: TenantTransactionClient,
  departmentId: string | null | undefined,
) {
  if (!departmentId) return;
  // Row-level security makes another organisation's departments invisible.
  const found = await tx.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });
  if (!found)
    throw invalidField(
      'departmentId',
      'Choose a department of your organisation',
    );
}

/** "2026-12-31" → a calendar date; null stays null; undefined stays undefined (no change). */
export function toDate(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(`${value}T00:00:00Z`);
}
