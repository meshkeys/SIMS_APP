import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../infrastructure/database/index.js';
import { personSelect, toPersonRef } from '../people/person.js';
import type { AuditPage, AuditQuery, PersonRef } from '@sims/contracts';

/** "RULESET_PROPOSED" → "Ruleset proposed" */
export const actionLabel = (action: string) => {
  const words = action.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * The audit log: every recorded change, newest first, read-only. Rows are
 * written by the same transaction as the change they describe, so the log
 * never misses or invents a change.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly db: TenantPrismaService) {}

  async list(query: AuditQuery): Promise<AuditPage> {
    const where: Prisma.AuditEventWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from
                ? { gte: new Date(`${query.from}T00:00:00Z`) }
                : {}),
              ...(query.to ? { lt: nextDay(query.to) } : {}),
            },
          }
        : {}),
    };
    return this.db.transaction(async (tx) => {
      const total = await tx.auditEvent.count({ where });
      const rows = await tx.auditEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
      const actorIds = [
        ...new Set(
          rows.map((r) => r.actorId).filter((id): id is string => !!id),
        ),
      ];
      const actors = new Map<string, PersonRef>(
        (
          await tx.membership.findMany({
            where: { id: { in: actorIds } },
            ...personSelect,
          })
        ).map((m) => [m.id, toPersonRef(m)!]),
      );
      const actions = await tx.auditEvent.groupBy({
        by: ['action'],
        orderBy: { action: 'asc' },
      });
      const entityTypes = await tx.auditEvent.groupBy({
        by: ['entityType'],
        orderBy: { entityType: 'asc' },
      });
      return {
        items: rows.map((row) => ({
          id: row.id,
          at: row.createdAt.toISOString(),
          actor: row.actorId ? (actors.get(row.actorId) ?? null) : null,
          action: row.action,
          actionLabel: actionLabel(row.action),
          entityType: row.entityType,
          entityId: row.entityId,
          before: row.before ?? null,
          after: row.after ?? null,
        })),
        page: query.page,
        pageSize: query.pageSize,
        total,
        actions: actions.map((a) => a.action),
        entityTypes: entityTypes.map((e) => e.entityType),
      };
    });
  }
}

function nextDay(isoDate: string): Date {
  const day = new Date(`${isoDate}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day;
}
