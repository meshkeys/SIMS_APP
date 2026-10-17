import { uuidv7 } from '../../common/ids/uuidv7.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  TenantContext,
  type TenantTransactionClient,
} from '../database/index.js';

export interface AuditEntry {
  /** Verb in past tense, e.g. "ELEMENT_CREATED", "LEVELS_CHANGED". */
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

const asJson = (value: unknown) =>
  value === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

/**
 * Appends an audit event inside the caller's transaction, so the change and
 * its audit record commit (or roll back) together. Organisation, actor and
 * request id come from the tenant context.
 */
export async function recordAudit(
  tx: TenantTransactionClient,
  entry: AuditEntry,
): Promise<void> {
  const context = TenantContext.require();
  await tx.auditEvent.create({
    data: {
      id: uuidv7(),
      organisationId: context.organisationId,
      actorId: context.membershipId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: asJson(entry.before),
      after: asJson(entry.after),
      requestId: context.requestId,
    },
  });
}
