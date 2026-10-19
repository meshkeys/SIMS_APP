import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { toIsoDate } from '../../common/data/numbers.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import {
  assemblePack,
  defaultPackTitle,
  nextVersion,
  quarterOf,
} from '../../domain/reports/assemble-pack.js';
import {
  isPackReady,
  type SnapshotDataV2,
} from '../../domain/reports/snapshot-data.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import { personSelect, toPersonRef } from '../people/person.js';
import type {
  CreatePackInput,
  PackContent,
  PackDefinition,
  ReportFormatKey,
  ReportPack,
  ReportSnapshot,
} from '@sims/contracts';

const packInclude = {
  period: { select: { name: true } },
  requestedBy: personSelect,
} as const;
type PackRow = Prisma.ReportPackGetPayload<{ include: typeof packInclude }>;

const snapshotNotFound = () =>
  new NotFoundException({
    code: 'SNAPSHOT_NOT_FOUND',
    message: 'Reporting snapshot not found.',
  });
const packNotFound = () =>
  new NotFoundException({
    code: 'REPORT_PACK_NOT_FOUND',
    message: 'Report pack not found.',
  });

/** Roles that see every pack; anyone else reading packs (the Board) sees Board packs only. */
const SEES_ALL_PACKS = [
  'STRATEGY_OFFICE',
  'SYSTEM_ADMIN',
  'CEO',
  'EXECUTIVE_SPONSOR',
  'INTERNAL_AUDIT',
] as const;
const boardOnly = (viewer: AuthContext) =>
  !viewer.roles.some((role) =>
    (SEES_ALL_PACKS as readonly string[]).includes(role),
  );

/**
 * Board packs and management reports. Packs are assembled from a locked
 * cycle's snapshot only, so the numbers in a pack always match what
 * management approved. This slice defines and queues packs; rendering the
 * files (PDF, PowerPoint, Excel) follows as a background job.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly db: TenantPrismaService) {}

  async snapshots(): Promise<ReportSnapshot[]> {
    const rows = await this.db.client.reportSnapshot.findMany({
      where: { kind: 'PERIOD_LOCK' },
      orderBy: [{ period: { endDate: 'desc' } }, { createdAt: 'desc' }],
      include: { period: { select: { name: true, endDate: true } } },
    });
    return rows.map((row) => {
      const data = row.data;
      const usable = isPackReady(data);
      const periodEnd = toIsoDate(row.period.endDate);
      return {
        id: row.id,
        periodId: row.periodId,
        period: row.period.name,
        periodEnd,
        quarter: quarterOf(periodEnd),
        lockedAt: usable ? data.lockedAt : row.createdAt.toISOString(),
        usable,
        pillars: usable
          ? data.elements
              .filter((e) => e.parentId === null)
              .map((e) => ({ id: e.id, code: e.code, title: e.title }))
          : [],
      };
    });
  }

  async preview(definition: PackDefinition): Promise<PackContent> {
    return this.db.transaction(async (tx) => {
      const { data, title } = await this.prepare(tx, definition);
      return assemblePack(data, definition, {
        organisation: await this.organisationName(tx),
        title,
      });
    });
  }

  /** Saves the definition and queues it; the next version for a repeat of a cycle and template. */
  async create(
    caller: AuthContext,
    input: CreatePackInput,
  ): Promise<ReportPack> {
    const id = uuidv7();
    await this.db.transaction(async (tx) => {
      const { data, title, periodId } = await this.prepare(tx, input);
      const previous = await tx.reportPack.findMany({
        where: { periodId, template: input.template },
        select: { version: true },
      });
      const version = nextVersion(previous.map((p) => p.version));
      const finalTitle = input.title ?? title;
      await tx.reportPack.create({
        data: {
          id,
          organisationId: TenantContext.require().organisationId,
          periodId,
          snapshotId: input.snapshotId,
          template: input.template,
          title: finalTitle,
          audience: input.audience,
          scopeElementId: input.scopeElementId,
          sections: input.sections,
          formats: [...new Set(input.formats)],
          narrative: input.narrative,
          status: 'QUEUED',
          version,
          requestedById: caller.membershipId,
        },
      });
      await recordAudit(tx, {
        action: 'REPORT_PACK_REQUESTED',
        entityType: 'ReportPack',
        entityId: id,
        after: {
          title: finalTitle,
          template: input.template,
          audience: input.audience,
          period: data.period.name,
          version,
          formats: input.formats,
        },
      });
    });
    return this.get(caller, id);
  }

  async list(viewer: AuthContext): Promise<ReportPack[]> {
    const rows = await this.db.client.reportPack.findMany({
      where: boardOnly(viewer) ? { audience: 'BOARD' } : {},
      orderBy: { createdAt: 'desc' },
      include: packInclude,
    });
    return rows.map(toPackView);
  }

  async get(viewer: AuthContext, packId: string): Promise<ReportPack> {
    const row = await this.db.client.reportPack.findUnique({
      where: { id: packId },
      include: packInclude,
    });
    if (!row || (boardOnly(viewer) && row.audience !== 'BOARD'))
      throw packNotFound();
    return toPackView(row);
  }

  // ---------------------------------------------------------------------------

  /** The snapshot, checked to hold everything packs need, and the pack's default title. */
  private async prepare(
    tx: TenantTransactionClient,
    definition: PackDefinition,
  ): Promise<{ data: SnapshotDataV2; title: string; periodId: string }> {
    const snapshot = await tx.reportSnapshot.findUnique({
      where: { id: definition.snapshotId },
      select: { periodId: true, data: true },
    });
    if (!snapshot) throw snapshotNotFound();
    if (!isPackReady(snapshot.data)) {
      throw new ConflictException({
        code: 'SNAPSHOT_TOO_OLD',
        message:
          'This cycle was locked before packs could be built from its snapshot. Choose a later cycle.',
      });
    }
    const data = snapshot.data;
    let pillarTitle: string | null = null;
    if (definition.scopeElementId) {
      const pillar = data.elements.find(
        (e) => e.id === definition.scopeElementId && e.parentId === null,
      );
      if (!pillar) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Some fields are missing or invalid.',
          errors: [
            {
              path: 'scopeElementId',
              message: 'Choose a pillar of this snapshot',
              code: 'custom',
            },
          ],
        });
      }
      pillarTitle = pillar.title;
    }
    return {
      data,
      periodId: snapshot.periodId,
      title: defaultPackTitle(definition.template, data, pillarTitle),
    };
  }

  private async organisationName(tx: TenantTransactionClient) {
    return (
      await tx.organisation.findUniqueOrThrow({
        where: { id: TenantContext.require().organisationId },
        select: { name: true },
      })
    ).name;
  }
}

function toPackView(row: PackRow): ReportPack {
  const files = (row.fileKeys ?? {}) as Partial<
    Record<ReportFormatKey, string>
  >;
  return {
    id: row.id,
    title: row.title,
    template: row.template,
    audience: row.audience,
    period: row.period.name,
    snapshotId: row.snapshotId,
    sections: Array.isArray(row.sections) ? (row.sections as string[]) : [],
    formats: row.formats,
    narrative: row.narrative,
    status: row.status,
    version: row.version,
    available:
      row.status === 'READY' ? row.formats.filter((f) => files[f]) : [],
    requestedBy: toPersonRef(row.requestedBy),
    requestedAt: row.createdAt.toISOString(),
    issuedAt: row.issuedAt?.toISOString() ?? null,
    error: row.error,
  };
}
