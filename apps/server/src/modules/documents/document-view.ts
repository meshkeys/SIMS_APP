import type { TenantTransactionClient } from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import { personSelect, toPersonRef } from '../people/person.js';
import type { DocumentView } from '@sims/contracts';

/** The columns `toDocumentViews` needs. */
export const documentSelect = {
  id: true,
  entityId: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  uploadedById: true,
  reviewedAt: true,
  createdAt: true,
} as const;

export interface DocumentRow {
  id: string;
  entityId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
  reviewedAt: Date | null;
  createdAt: Date;
}

export const isOffice = (caller: AuthContext) =>
  caller.roles.includes('STRATEGY_OFFICE') ||
  caller.roles.includes('SYSTEM_ADMIN');

/**
 * Who may remove a document: its uploader or the Strategy Office, until the
 * Strategy Office has reviewed it (then it is part of the verified record).
 */
export const canDeleteDocument = (
  caller: AuthContext,
  row: Pick<DocumentRow, 'uploadedById' | 'reviewedAt'>,
) =>
  row.reviewedAt === null &&
  (isOffice(caller) || row.uploadedById === caller.membershipId);

/** API views of document rows, with uploader names, in the given order. */
export async function toDocumentViews(
  tx: TenantTransactionClient,
  rows: readonly DocumentRow[],
  caller: AuthContext,
): Promise<DocumentView[]> {
  const people = new Map(
    (
      await tx.membership.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.uploadedById))] } },
        ...personSelect,
      })
    ).map((m) => [m.id, toPersonRef(m)]),
  );
  return rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedBy: people.get(row.uploadedById) ?? null,
    uploadedAt: row.createdAt.toISOString(),
    reviewed: row.reviewedAt !== null,
    can: { delete: canDeleteDocument(caller, row) },
  }));
}
