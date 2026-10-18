import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { toIsoDate } from '../../common/data/numbers.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { canSeeInitiative } from '../../domain/access/initiative-visibility.js';
import { relationTo } from '../../domain/delivery/permissions.js';
import { heatmap, severityFor } from '../../domain/governance/risks.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  RiskStatus,
  RiskType,
  Severity,
} from '../../generated/prisma/enums.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import { HealthRecalculationService } from '../delivery/health-recalculation.service.js';
import { seesAllInitiatives } from '../delivery/visibility.js';
import { loadForWrite } from '../delivery/write-access.js';
import {
  assertActiveMembers,
  personSelect,
  type PersonRef,
  toPersonRef,
} from '../people/person.js';
import type {
  CreateRiskInput,
  RiskQuery,
  UpdateRiskInput,
} from './governance.schemas.js';

export interface RiskView {
  id: string;
  type: RiskType;
  title: string;
  description: string | null;
  likelihood: number | null;
  impact: number | null;
  /** likelihood × impact (risks only). */
  score: number | null;
  severity: Severity;
  status: RiskStatus;
  initiative: { id: string; code: string; title: string } | null;
  owner: PersonRef | null;
  mitigation: string | null;
  dueDate: string | null;
  closedAt: string | null;
  /** The open escalation it has raised, if any. */
  escalation: { reference: string; level: number } | null;
  createdAt: string;
  updatedAt: string;
}

export interface RiskRegister {
  items: RiskView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Open risks on the 5×5 grid (rows: impact 5→1; columns: likelihood 1→5), under the other filters. */
  heatmap: number[][];
  counts: {
    risks: number;
    issues: number;
    bySeverity: Record<Severity, number>;
  };
}

const riskInclude = {
  initiative: { select: { id: true, code: true, title: true } },
  owner: personSelect,
  escalations: {
    where: { status: 'OPEN' as const },
    select: { reference: true, level: true },
    orderBy: { level: 'desc' as const },
    take: 1,
  },
};

type RiskRow = Prisma.RiskIssueGetPayload<{ include: typeof riskInclude }>;

const toView = (risk: RiskRow): RiskView => ({
  id: risk.id,
  type: risk.type,
  title: risk.title,
  description: risk.description,
  likelihood: risk.likelihood,
  impact: risk.impact,
  score: risk.likelihood && risk.impact ? risk.likelihood * risk.impact : null,
  severity: risk.severity,
  status: risk.status,
  initiative: risk.initiative,
  owner: toPersonRef(risk.owner),
  mitigation: risk.mitigation,
  dueDate: toIsoDate(risk.dueDate),
  closedAt: risk.closedAt?.toISOString() ?? null,
  escalation: risk.escalations[0] ?? null,
  createdAt: risk.createdAt.toISOString(),
  updatedAt: risk.updatedAt.toISOString(),
});

const riskNotFound = () =>
  new NotFoundException({
    code: 'RISK_NOT_FOUND',
    message: 'Risk or issue not found.',
  });

/** Risks and issues: the register, the heatmap, and changes by the accountable people. */
@Injectable()
export class RisksService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly recalculation: HealthRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(viewer: AuthContext, query: RiskQuery): Promise<RiskRegister> {
    const visible = this.visibility(viewer);
    const base: Prisma.RiskIssueWhereInput = {
      AND: [
        visible,
        query.initiativeId ? { initiativeId: query.initiativeId } : {},
        query.ownerId ? { ownerId: query.ownerId } : {},
        query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: 'insensitive' } },
                {
                  initiative: {
                    code: { contains: query.q, mode: 'insensitive' },
                  },
                },
              ],
            }
          : {},
      ],
    };
    const where: Prisma.RiskIssueWhereInput = {
      AND: [
        base,
        { status: { in: query.status ?? ['OPEN'] } },
        query.type ? { type: query.type } : {},
        query.severity ? { severity: { in: query.severity } } : {},
        query.likelihood ? { likelihood: query.likelihood } : {},
        query.impact ? { impact: query.impact } : {},
      ],
    };
    const db = this.db.client;
    const [total, rows, grid, bySeverity, byType] = await Promise.all([
      db.riskIssue.count({ where }),
      db.riskIssue.findMany({
        where,
        include: riskInclude,
        // Severity is declared LOW → CRITICAL, so descending puts critical first.
        orderBy: [
          { severity: 'desc' },
          { dueDate: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.riskIssue.findMany({
        where: { AND: [base, { type: 'RISK', status: 'OPEN' }] },
        select: { likelihood: true, impact: true },
      }),
      db.riskIssue.groupBy({
        by: ['severity'],
        where: { AND: [base, { status: 'OPEN' }] },
        _count: { _all: true },
      }),
      db.riskIssue.groupBy({
        by: ['type'],
        where: { AND: [base, { status: 'OPEN' }] },
        _count: { _all: true },
      }),
    ]);
    const severityCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    bySeverity.forEach(
      (row) => (severityCounts[row.severity] = row._count._all),
    );
    return {
      items: rows.map(toView),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      heatmap: heatmap(grid),
      counts: {
        risks: byType.find((t) => t.type === 'RISK')?._count._all ?? 0,
        issues: byType.find((t) => t.type === 'ISSUE')?._count._all ?? 0,
        bySeverity: severityCounts,
      },
    };
  }

  async get(viewer: AuthContext, riskId: string): Promise<RiskView> {
    const risk = await this.db.client.riskIssue.findFirst({
      where: { AND: [{ id: riskId }, this.visibility(viewer)] },
      include: riskInclude,
    });
    if (!risk) throw riskNotFound();
    return toView(risk);
  }

  /** Initiative risks: its owner, sponsor or the Strategy Office. Portfolio risks: the Strategy Office. */
  async create(caller: AuthContext, input: CreateRiskInput): Promise<RiskView> {
    const id = uuidv7();
    await this.db.transaction(async (tx) => {
      if (input.initiativeId) {
        await loadForWrite(tx, caller, input.initiativeId);
      } else if (!isOffice(caller)) {
        throw new ForbiddenException({
          code: 'STRATEGY_OFFICE_ONLY',
          message: 'Only the Strategy Office records portfolio-level risks.',
        });
      }
      await assertActiveMembers(tx, { ownerId: input.ownerId });
      const severity =
        input.type === 'RISK'
          ? severityFor(input.likelihood!, input.impact!)
          : input.severity!;
      await tx.riskIssue.create({
        data: {
          id,
          organisationId: TenantContext.require().organisationId,
          initiativeId: input.initiativeId,
          type: input.type,
          title: input.title,
          description: input.description,
          likelihood: input.type === 'RISK' ? input.likelihood : null,
          impact: input.impact,
          severity,
          ownerId: input.ownerId,
          mitigation: input.mitigation,
          dueDate: input.dueDate
            ? new Date(`${input.dueDate}T00:00:00Z`)
            : null,
        },
      });
      await recordAudit(tx, {
        action: input.type === 'RISK' ? 'RISK_LOGGED' : 'ISSUE_LOGGED',
        entityType: 'RiskIssue',
        entityId: id,
        after: {
          title: input.title,
          severity,
          initiativeId: input.initiativeId,
        },
      });
      await this.recalculateFor(tx, input.initiativeId);
    });
    return this.get(caller, id);
  }

  /** The risk's owner, the initiative's owner or sponsor, or the Strategy Office. */
  async update(
    caller: AuthContext,
    riskId: string,
    input: UpdateRiskInput,
  ): Promise<RiskView> {
    await this.db.transaction(async (tx) => {
      const risk = await tx.riskIssue.findUnique({
        where: { id: riskId },
        include: {
          initiative: {
            select: {
              isSensitive: true,
              ownerId: true,
              sponsorId: true,
              benefitsOwnerId: true,
            },
          },
        },
      });
      if (
        !risk ||
        (risk.initiative && !canSeeInitiative(caller, risk.initiative))
      )
        throw riskNotFound();
      const accountable =
        isOffice(caller) ||
        risk.ownerId === caller.membershipId ||
        (risk.initiative !== null &&
          relationTo(caller, risk.initiative) !== 'NONE');
      if (!accountable) {
        throw new ForbiddenException({
          code: 'NOT_ACCOUNTABLE',
          message:
            'Only the risk owner, the initiative’s owner or sponsor, or the Strategy Office can change it.',
        });
      }
      await assertActiveMembers(tx, { ownerId: input.ownerId });

      const likelihood = input.likelihood ?? risk.likelihood;
      const impact = input.impact ?? risk.impact;
      const severity =
        risk.type === 'RISK' && likelihood && impact
          ? severityFor(likelihood, impact)
          : (input.severity ?? risk.severity);
      const closing =
        input.status && input.status !== 'OPEN' && risk.status === 'OPEN';
      const reopening = input.status === 'OPEN' && risk.status !== 'OPEN';

      await tx.riskIssue.update({
        where: { id: riskId },
        data: {
          ...input,
          dueDate:
            input.dueDate === undefined
              ? undefined
              : input.dueDate
                ? new Date(`${input.dueDate}T00:00:00Z`)
                : null,
          severity,
          ...(closing
            ? { closedAt: this.clock.now() }
            : reopening
              ? { closedAt: null }
              : {}),
        },
      });
      await recordAudit(tx, {
        action: closing ? `${risk.type}_${input.status}` : 'RISK_UPDATED',
        entityType: 'RiskIssue',
        entityId: riskId,
        before: Object.fromEntries(
          Object.keys(input).map((key) => [
            key,
            (risk as Record<string, unknown>)[key],
          ]),
        ),
        after: { ...input, severity },
      });
      // A critical issue opening or closing changes the initiative's health cap.
      await this.recalculateFor(tx, risk.initiativeId);
    });
    return this.get(caller, riskId);
  }

  private visibility(viewer: AuthContext): Prisma.RiskIssueWhereInput {
    if (seesAllInitiatives(viewer)) return {};
    return {
      OR: [
        { initiativeId: null },
        { initiative: { isSensitive: false } },
        { initiative: { ownerId: viewer.membershipId } },
        { initiative: { sponsorId: viewer.membershipId } },
        { initiative: { benefitsOwnerId: viewer.membershipId } },
      ],
    };
  }

  private async recalculateFor(
    tx: TenantTransactionClient,
    initiativeId: string | null,
  ) {
    if (initiativeId)
      await this.recalculation.recalculateIn(tx, [initiativeId]);
  }
}

function isOffice(caller: AuthContext): boolean {
  return (
    caller.roles.includes('STRATEGY_OFFICE') ||
    caller.roles.includes('SYSTEM_ADMIN')
  );
}
