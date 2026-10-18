import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { toIsoDate, toNumber } from '../../common/data/numbers.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { canSeeInitiative } from '../../domain/access/initiative-visibility.js';
import { isBaselineLocked } from '../../domain/delivery/lifecycle.js';
import {
  applyChanges,
  type BaselineState,
  isEmptyChange,
  type RequestedChanges,
} from '../../domain/governance/change-requests.js';
import {
  CHANGE_APPROVER,
  nextReference,
} from '../../domain/governance/decisions.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  ApprovalStatus,
  ApprovalType,
  Role,
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
import { personSelect, type PersonRef, toPersonRef } from '../people/person.js';
import type {
  ChangeRequestQuery,
  CreateChangeRequestInput,
} from './governance.schemas.js';

export interface ChangeRequestView {
  id: string;
  reference: string;
  type: ApprovalType;
  status: ApprovalStatus;
  initiative: { id: string; code: string; title: string };
  changes: RequestedChanges;
  /** The baseline values the change replaces. */
  before: Record<string, unknown>;
  justification: string | null;
  requestedBy: PersonRef | null;
  approver: PersonRef | null;
  decisionId: string | null;
  decisionReason: string | null;
  decidedAt: string | null;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  BASELINE_CHANGE: 'baseline change',
  BUDGET_CHANGE: 'budget change',
  SCOPE_CHANGE: 'scope change',
};

const approvalInclude = {
  requestedBy: personSelect,
  reviewer: personSelect,
  decision: { select: { id: true } },
};

const notFound = () =>
  new NotFoundException({
    code: 'CHANGE_REQUEST_NOT_FOUND',
    message: 'Change request not found.',
  });

/**
 * Maker-checker changes to a locked baseline: requested with a justification,
 * decided by someone other than the requester, applied only when approved.
 */
@Injectable()
export class ChangeRequestsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly recalculation: HealthRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(
    caller: AuthContext,
    initiativeId: string,
    input: CreateChangeRequestInput,
  ): Promise<ChangeRequestView> {
    const id = uuidv7();
    await this.db.transaction(async (tx) => {
      const { initiative } = await loadForWrite(tx, caller, initiativeId);
      if (!isBaselineLocked(initiative.status)) {
        throw new ConflictException({
          code: 'CHANGE_REQUEST_NOT_NEEDED',
          message:
            'This initiative is not in delivery yet: edit its baseline directly.',
        });
      }
      if (isEmptyChange(input.changes)) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Nothing to change.',
          errors: [
            {
              path: 'changes',
              message: 'Request at least one change',
              code: 'custom',
            },
          ],
        });
      }
      const current = await this.baselineOf(tx, initiativeId);
      const { problems } = applyChanges(current, input.changes);
      if (problems.length) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'The requested change is not coherent.',
          errors: problems.map((p) => ({
            path: `changes.${p.path}`,
            message: p.message,
            code: 'custom',
          })),
        });
      }

      const approver = await this.approverFor(
        tx,
        input.type,
        initiative.sponsorId,
        caller.membershipId,
      );
      const references = await this.allReferences(tx);
      const reference = nextReference('CR', references);
      const before = this.beforeValues(current, input.changes);
      const now = this.clock.now();
      const { organisationId } = TenantContext.require();

      await tx.approval.create({
        data: {
          id,
          organisationId,
          reference,
          type: input.type,
          entityType: 'Initiative',
          entityId: initiativeId,
          payload: { changes: input.changes, before } as Prisma.InputJsonValue,
          justification: input.justification,
          requestedById: caller.membershipId,
          reviewerId: approver.membershipId,
        },
      });
      await tx.decision.create({
        data: {
          id: uuidv7(),
          organisationId,
          initiativeId,
          reference,
          title: `Approve ${TYPE_LABEL[input.type]} for ${initiative.code}: ${this.summary(input.changes, before)}`,
          context: input.justification,
          requiredFrom: approver.role,
          requiredFromId: approver.membershipId,
          approvalId: id,
          dueDate: new Date(
            `${input.dueDate ?? toIsoDate(new Date(now.getTime() + 7 * 86_400_000))}T00:00:00Z`,
          ),
        },
      });
      await recordAudit(tx, {
        action: 'CHANGE_REQUESTED',
        entityType: 'Initiative',
        entityId: initiativeId,
        after: { reference, type: input.type, changes: input.changes },
      });
    });
    return this.get(caller, id);
  }

  async list(
    viewer: AuthContext,
    query: ChangeRequestQuery,
  ): Promise<ChangeRequestView[]> {
    const approvals = await this.db.client.approval.findMany({
      where: {
        type: { in: ['BASELINE_CHANGE', 'BUDGET_CHANGE', 'SCOPE_CHANGE'] },
        entityType: 'Initiative',
        ...(query.status ? { status: query.status } : {}),
        ...(query.initiativeId ? { entityId: query.initiativeId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: approvalInclude,
    });
    const initiatives = await this.initiativesFor(
      viewer,
      approvals.map((a) => a.entityId),
    );
    return approvals
      .filter((a) => initiatives.has(a.entityId))
      .map((a) => this.toView(a, initiatives.get(a.entityId)!));
  }

  async get(
    viewer: AuthContext,
    approvalId: string,
  ): Promise<ChangeRequestView> {
    const approval = await this.db.client.approval.findUnique({
      where: { id: approvalId },
      include: approvalInclude,
    });
    if (!approval || approval.entityType !== 'Initiative') throw notFound();
    const initiative = (
      await this.initiativesFor(viewer, [approval.entityId])
    ).get(approval.entityId);
    if (!initiative) throw notFound();
    return this.toView(approval, initiative);
  }

  /** The requester (or the Strategy Office) withdraws a pending request. */
  async withdraw(
    caller: AuthContext,
    approvalId: string,
  ): Promise<ChangeRequestView> {
    await this.db.transaction(async (tx) => {
      const approval = await tx.approval.findUnique({
        where: { id: approvalId },
        include: { decision: true },
      });
      if (!approval) throw notFound();
      const office =
        caller.roles.includes('STRATEGY_OFFICE') ||
        caller.roles.includes('SYSTEM_ADMIN');
      if (approval.requestedById !== caller.membershipId && !office) {
        throw new ForbiddenException({
          code: 'NOT_REQUESTER',
          message: 'Only the requester can withdraw this change request.',
        });
      }
      if (approval.status !== 'PENDING') {
        throw new ConflictException({
          code: 'CHANGE_REQUEST_CLOSED',
          message: `This request was already ${approval.status.toLowerCase()}.`,
        });
      }
      const now = this.clock.now();
      await tx.approval.update({
        where: { id: approvalId },
        data: {
          status: 'WITHDRAWN',
          decidedAt: now,
          decisionReason: 'Withdrawn by the requester',
        },
      });
      if (approval.decision) {
        await tx.decision.update({
          where: { id: approval.decision.id },
          data: {
            outcome: 'REJECTED',
            outcomeNotes: 'Withdrawn by the requester',
            decidedById: caller.membershipId,
            decidedAt: now,
          },
        });
      }
      await recordAudit(tx, {
        action: 'CHANGE_WITHDRAWN',
        entityType: 'Initiative',
        entityId: approval.entityId,
        after: { reference: approval.reference },
      });
    });
    return this.get(caller, approvalId);
  }

  /**
   * Applies an approved request. Re-validated against the baseline as it is
   * now, because the initiative may have changed since the request was made.
   */
  async apply(
    tx: TenantTransactionClient,
    approvalId: string,
    approverId: string,
    notes: string | undefined,
  ): Promise<void> {
    const approval = await tx.approval.findUniqueOrThrow({
      where: { id: approvalId },
    });
    const payload = approval.payload as unknown as {
      changes: RequestedChanges;
    };
    const current = await this.baselineOf(tx, approval.entityId);
    const { problems } = applyChanges(current, payload.changes);
    if (problems.length) {
      throw new ConflictException({
        code: 'CHANGE_NO_LONGER_VALID',
        message:
          'The initiative has changed since this request was made; the change can no longer be applied as requested.',
        errors: problems.map((p) => ({
          path: p.path,
          message: p.message,
          code: 'custom',
        })),
      });
    }
    const changes = payload.changes;
    const date = (value: string | null | undefined) =>
      value === undefined
        ? undefined
        : value === null
          ? null
          : new Date(`${value}T00:00:00Z`);

    await tx.initiative.update({
      where: { id: approval.entityId },
      data: {
        baselineStart: date(changes.baselineStart),
        baselineEnd: date(changes.baselineEnd),
        baselineBudget: changes.baselineBudget,
        scope: changes.scope,
      },
    });
    for (const change of changes.milestones ?? []) {
      await tx.milestone.update({
        where: { id: change.milestoneId },
        data: {
          weight: change.weight,
          isCritical: change.isCritical,
          baselineStartDate: date(change.baselineStartDate),
          baselineDate: date(change.baselineDate) ?? undefined,
        },
      });
    }
    if (changes.removeMilestoneIds?.length) {
      await tx.milestone.deleteMany({
        where: {
          id: { in: changes.removeMilestoneIds },
          initiativeId: approval.entityId,
        },
      });
    }
    const last = await tx.milestone.findFirst({
      where: { initiativeId: approval.entityId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    let order = (last?.sortOrder ?? -1) + 1;
    for (const added of changes.addMilestones ?? []) {
      await tx.milestone.create({
        data: {
          id: uuidv7(),
          organisationId: TenantContext.require().organisationId,
          initiativeId: approval.entityId,
          title: added.title,
          weight: added.weight,
          isCritical: added.isCritical ?? false,
          baselineStartDate: date(added.baselineStartDate) ?? null,
          baselineDate: date(added.baselineDate)!,
          sortOrder: order++,
        },
      });
    }
    await tx.approval.update({
      where: { id: approvalId },
      data: {
        status: 'APPROVED',
        reviewerId: approverId,
        decidedAt: this.clock.now(),
        decisionReason: notes ?? null,
      },
    });
    await recordAudit(tx, {
      action: 'BASELINE_CHANGED',
      entityType: 'Initiative',
      entityId: approval.entityId,
      before: (approval.payload as { before?: unknown }).before,
      after: { reference: approval.reference, changes },
    });
    await this.recalculation.recalculateIn(tx, [approval.entityId]);
  }

  async reject(
    tx: TenantTransactionClient,
    approvalId: string,
    approverId: string,
    notes: string | undefined,
  ): Promise<void> {
    const approval = await tx.approval.update({
      where: { id: approvalId },
      data: {
        status: 'REJECTED',
        reviewerId: approverId,
        decidedAt: this.clock.now(),
        decisionReason: notes ?? null,
      },
    });
    await recordAudit(tx, {
      action: 'CHANGE_REJECTED',
      entityType: 'Initiative',
      entityId: approval.entityId,
      after: { reference: approval.reference, notes },
    });
  }

  // ---------------------------------------------------------------------------

  private async baselineOf(
    tx: TenantTransactionClient,
    initiativeId: string,
  ): Promise<BaselineState> {
    const initiative = await tx.initiative.findUniqueOrThrow({
      where: { id: initiativeId },
      select: {
        baselineStart: true,
        baselineEnd: true,
        baselineBudget: true,
        scope: true,
        milestones: {
          select: {
            id: true,
            title: true,
            weight: true,
            isCritical: true,
            baselineStartDate: true,
            baselineDate: true,
            verifiedCompletion: true,
            _count: { select: { updateLines: true } },
          },
        },
      },
    });
    return {
      baselineStart: toIsoDate(initiative.baselineStart),
      baselineEnd: toIsoDate(initiative.baselineEnd),
      baselineBudget: toNumber(initiative.baselineBudget),
      scope: initiative.scope,
      milestones: initiative.milestones.map((m) => ({
        id: m.id,
        title: m.title,
        weight: toNumber(m.weight),
        isCritical: m.isCritical,
        baselineStartDate: toIsoDate(m.baselineStartDate),
        baselineDate: toIsoDate(m.baselineDate),
        hasProgress:
          toNumber(m.verifiedCompletion) > 0 || m._count.updateLines > 0,
      })),
    };
  }

  /**
   * Baseline changes go to the CEO; budget and scope to the initiative's
   * sponsor — unless the sponsor is the requester, in which case the CEO
   * decides (nobody approves their own request).
   */
  private async approverFor(
    tx: TenantTransactionClient,
    type: CreateChangeRequestInput['type'],
    sponsorId: string | null,
    requesterId: string,
  ): Promise<{ role: Role; membershipId: string | null }> {
    if (
      CHANGE_APPROVER[type] === 'SPONSOR' &&
      sponsorId &&
      sponsorId !== requesterId
    ) {
      return { role: 'EXECUTIVE_SPONSOR', membershipId: sponsorId };
    }
    const ceo = await tx.membership.findFirst({
      where: {
        roles: { has: 'CEO' },
        status: 'ACTIVE',
        id: { not: requesterId },
      },
      orderBy: { joinedAt: 'asc' },
      select: { id: true },
    });
    return { role: 'CEO', membershipId: ceo?.id ?? null };
  }

  private async allReferences(tx: TenantTransactionClient): Promise<string[]> {
    const [approvals, decisions] = await Promise.all([
      tx.approval.findMany({
        where: { reference: { startsWith: 'CR-' } },
        select: { reference: true },
      }),
      tx.decision.findMany({
        where: { reference: { startsWith: 'CR-' } },
        select: { reference: true },
      }),
    ]);
    return [
      ...approvals.map((a) => a.reference!),
      ...decisions.map((d) => d.reference),
    ];
  }

  private beforeValues(
    current: BaselineState,
    changes: RequestedChanges,
  ): Record<string, unknown> {
    const before: Record<string, unknown> = {};
    for (const key of [
      'baselineStart',
      'baselineEnd',
      'baselineBudget',
      'scope',
    ] as const) {
      if (changes[key] !== undefined) before[key] = current[key];
    }
    if (changes.milestones?.length || changes.removeMilestoneIds?.length) {
      const touched = new Set([
        ...(changes.milestones ?? []).map((m) => m.milestoneId),
        ...(changes.removeMilestoneIds ?? []),
      ]);
      before.milestones = current.milestones.filter((m) => touched.has(m.id));
    }
    return before;
  }

  /** "end 15 Oct 2026 → 26 Nov 2026", "budget 1,200,000,000 → 1,285,000,000", "2 milestones". */
  private summary(
    changes: RequestedChanges,
    before: Record<string, unknown>,
  ): string {
    const fmt = (value: unknown) =>
      typeof value === 'number'
        ? value.toLocaleString('en-GB')
        : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? new Intl.DateTimeFormat('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              timeZone: 'UTC',
            }).format(new Date(value))
          : value === null || value === undefined
            ? '—'
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value as string | boolean);
    const parts: string[] = [];
    if (changes.baselineStart !== undefined)
      parts.push(
        `start ${fmt(before.baselineStart)} → ${fmt(changes.baselineStart)}`,
      );
    if (changes.baselineEnd !== undefined)
      parts.push(
        `end ${fmt(before.baselineEnd)} → ${fmt(changes.baselineEnd)}`,
      );
    if (changes.baselineBudget !== undefined)
      parts.push(
        `budget ${fmt(before.baselineBudget)} → ${fmt(changes.baselineBudget)}`,
      );
    if (changes.scope !== undefined) parts.push('scope');
    const milestoneCount =
      (changes.milestones?.length ?? 0) +
      (changes.addMilestones?.length ?? 0) +
      (changes.removeMilestoneIds?.length ?? 0);
    if (milestoneCount)
      parts.push(
        `${milestoneCount} milestone${milestoneCount === 1 ? '' : 's'}`,
      );
    return parts.join('; ');
  }

  private async initiativesFor(viewer: AuthContext, ids: string[]) {
    const initiatives = await this.db.client.initiative.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: {
        id: true,
        code: true,
        title: true,
        isSensitive: true,
        ownerId: true,
        sponsorId: true,
        benefitsOwnerId: true,
      },
    });
    const all = seesAllInitiatives(viewer);
    return new Map(
      initiatives
        .filter((i) => all || canSeeInitiative(viewer, i))
        .map((i) => [i.id, { id: i.id, code: i.code, title: i.title }]),
    );
  }

  private toView(
    approval: Prisma.ApprovalGetPayload<{ include: typeof approvalInclude }>,
    initiative: { id: string; code: string; title: string },
  ): ChangeRequestView {
    const payload = approval.payload as {
      changes?: RequestedChanges;
      before?: Record<string, unknown>;
    };
    return {
      id: approval.id,
      reference: approval.reference ?? '',
      type: approval.type,
      status: approval.status,
      initiative,
      changes: payload.changes ?? {},
      before: payload.before ?? {},
      justification: approval.justification,
      requestedBy: toPersonRef(approval.requestedBy),
      approver: toPersonRef(approval.reviewer),
      decisionId: approval.decision?.id ?? null,
      decisionReason: approval.decisionReason,
      decidedAt: approval.decidedAt?.toISOString() ?? null,
      createdAt: approval.createdAt.toISOString(),
    };
  }
}
