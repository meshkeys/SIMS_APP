import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { toIsoDate } from '../../common/data/numbers.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { canSeeInitiative } from '../../domain/access/initiative-visibility.js';
import { daysBetween } from '../../domain/delivery/progress.js';
import {
  decideRight,
  isOpen,
  nextReference,
} from '../../domain/governance/decisions.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { DecisionOutcome, Role } from '../../generated/prisma/enums.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import { seesAllInitiatives } from '../delivery/visibility.js';
import {
  assertActiveMembers,
  personSelect,
  type PersonRef,
  toPersonRef,
} from '../people/person.js';
import { ChangeRequestsService } from './change-requests.service.js';
import type {
  CreateDecisionInput,
  DecideInput,
  DecisionQuery,
} from './governance.schemas.js';

export interface DecisionView {
  id: string;
  reference: string;
  title: string;
  context: string | null;
  kind: 'CHANGE_REQUEST' | 'DECISION';
  initiative: { id: string; code: string; title: string } | null;
  /** Role that must decide, and the named person when there is one. */
  requiredFrom: Role;
  decisionOwner: PersonRef | null;
  dueDate: string | null;
  /** Days past the due date while still open; 0 otherwise. */
  overdueDays: number;
  outcome: DecisionOutcome;
  outcomeNotes: string | null;
  deferredUntil: string | null;
  decidedBy: PersonRef | null;
  decidedAt: string | null;
  changeRequestId: string | null;
  /** Whether the caller may record the decision now. */
  canDecide: boolean;
}

export interface DecisionPage {
  items: DecisionView[];
  page: number;
  pageSize: number;
  total: number;
}

const decisionInclude = {
  initiative: {
    select: {
      id: true,
      code: true,
      title: true,
      isSensitive: true,
      ownerId: true,
      sponsorId: true,
      benefitsOwnerId: true,
    },
  },
  requiredFromMember: personSelect,
  decidedBy: personSelect,
  approval: { select: { id: true, requestedById: true, status: true } },
};
type DecisionRow = Prisma.DecisionGetPayload<{
  include: typeof decisionInclude;
}>;

const notFound = () =>
  new NotFoundException({
    code: 'DECISION_NOT_FOUND',
    message: 'Decision not found.',
  });

/** "Decisions required" and the decision log; recording outcomes, including change requests. */
@Injectable()
export class DecisionsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly changeRequests: ChangeRequestsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(viewer: AuthContext, query: DecisionQuery): Promise<DecisionPage> {
    const today = this.today();
    const open = this.openWhere(today);
    const where: Prisma.DecisionWhereInput = {
      AND: [
        this.visibility(viewer),
        query.view === 'open' ? open : { NOT: open },
      ],
    };
    const [total, rows] = await Promise.all([
      this.db.client.decision.count({ where }),
      this.db.client.decision.findMany({
        where,
        include: decisionInclude,
        orderBy:
          query.view === 'open'
            ? [
                { dueDate: { sort: 'asc', nulls: 'last' } },
                { createdAt: 'asc' },
              ]
            : [{ decidedAt: { sort: 'desc', nulls: 'last' } }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => this.toView(viewer, row, today)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /**
   * The first open decisions (most urgent first) and how many are open, for
   * the dashboard; `initiativeIds` limits them to those initiatives.
   */
  async openSummary(
    viewer: AuthContext,
    initiativeIds: string[] | null,
    take: number,
  ): Promise<{ items: DecisionView[]; total: number }> {
    const today = this.today();
    const where: Prisma.DecisionWhereInput = {
      AND: [
        this.visibility(viewer),
        this.openWhere(today),
        initiativeIds ? { initiativeId: { in: initiativeIds } } : {},
      ],
    };
    const [total, rows] = await Promise.all([
      this.db.client.decision.count({ where }),
      this.db.client.decision.findMany({
        where,
        include: decisionInclude,
        orderBy: [
          { dueDate: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
        ],
        take,
      }),
    ]);
    return { items: rows.map((row) => this.toView(viewer, row, today)), total };
  }

  async get(viewer: AuthContext, decisionId: string): Promise<DecisionView> {
    const row = await this.db.client.decision.findFirst({
      where: { AND: [{ id: decisionId }, this.visibility(viewer)] },
      include: decisionInclude,
    });
    if (!row) throw notFound();
    return this.toView(viewer, row, this.today());
  }

  /** Raise a decision for management (Strategy Office). */
  async create(
    caller: AuthContext,
    input: CreateDecisionInput,
  ): Promise<DecisionView> {
    const id = uuidv7();
    await this.db.transaction(async (tx) => {
      if (input.initiativeId) {
        const initiative = await tx.initiative.findUnique({
          where: { id: input.initiativeId },
          select: {
            isSensitive: true,
            ownerId: true,
            sponsorId: true,
            benefitsOwnerId: true,
          },
        });
        if (!initiative || !canSeeInitiative(caller, initiative)) {
          throw new NotFoundException({
            code: 'INITIATIVE_NOT_FOUND',
            message: 'Initiative not found.',
          });
        }
      }
      await assertActiveMembers(tx, { requiredFromId: input.requiredFromId });
      await this.insert(tx, { id, prefix: 'DEC', ...input });
    });
    return this.get(caller, id);
  }

  /**
   * Called when an owner ticks "I need a management decision" on an update:
   * puts it in front of the initiative's sponsor.
   */
  async requestFromUpdate(
    tx: TenantTransactionClient,
    update: {
      initiativeId: string;
      code: string;
      title: string;
      sponsorId: string | null;
      context: string | null;
      dueDate: Date | null;
    },
  ): Promise<void> {
    const existing = await tx.decision.findFirst({
      where: {
        initiativeId: update.initiativeId,
        outcome: 'PENDING',
        title: { startsWith: 'Decision needed on' },
      },
      select: { id: true },
    });
    if (existing) return;
    await this.insert(tx, {
      id: uuidv7(),
      prefix: 'DEC',
      title: `Decision needed on ${update.code} ${update.title}`,
      context: update.context,
      initiativeId: update.initiativeId,
      requiredFrom: 'EXECUTIVE_SPONSOR',
      requiredFromId: update.sponsorId,
      dueDate: update.dueDate ? toIsoDate(update.dueDate) : null,
    });
  }

  /**
   * Records an outcome. For change requests, approving applies the change
   * and rejecting closes the request; deferring leaves it pending until the
   * chosen date, when it reappears in "Decisions required".
   */
  async decide(
    caller: AuthContext,
    decisionId: string,
    input: DecideInput,
  ): Promise<DecisionView> {
    await this.db.transaction(async (tx) => {
      const row = await tx.decision.findFirst({
        where: { AND: [{ id: decisionId }, this.visibility(caller)] },
        include: decisionInclude,
      });
      if (!row) throw notFound();
      const today = this.today();
      if (!isOpen(row, today)) {
        throw new ConflictException({
          code: 'ALREADY_DECIDED',
          message: `${row.reference} was already decided (${row.outcome.toLowerCase()}).`,
        });
      }
      const right = decideRight(caller, {
        requiredFrom: row.requiredFrom,
        requiredFromId: row.requiredFromId,
        requestedById: row.approval?.requestedById ?? null,
        isChangeRequest: row.approval !== null,
      });
      if (!right) {
        throw new ForbiddenException({
          code: 'CANNOT_DECIDE',
          message:
            row.approval?.requestedById === caller.membershipId
              ? 'You requested this change, so someone else must decide it.'
              : 'This decision belongs to someone else.',
        });
      }
      if (
        input.outcome === 'DEFERRED' &&
        input.deferredUntil! <= toIsoDate(today)
      ) {
        throw new ConflictException({
          code: 'VALIDATION_FAILED',
          message: 'Choose a future date to revisit it.',
        });
      }

      if (row.approval) {
        if (input.outcome === 'APPROVED')
          await this.changeRequests.apply(
            tx,
            row.approval.id,
            caller.membershipId,
            input.notes,
          );
        if (input.outcome === 'REJECTED')
          await this.changeRequests.reject(
            tx,
            row.approval.id,
            caller.membershipId,
            input.notes,
          );
      }
      await tx.decision.update({
        where: { id: decisionId },
        data: {
          outcome: input.outcome,
          outcomeNotes: input.notes ?? null,
          deferredUntil:
            input.outcome === 'DEFERRED'
              ? new Date(`${input.deferredUntil}T00:00:00Z`)
              : null,
          decidedById: caller.membershipId,
          decidedAt: this.clock.now(),
        },
      });
      await recordAudit(tx, {
        action: 'DECISION_RECORDED',
        entityType: 'Decision',
        entityId: decisionId,
        after: {
          reference: row.reference,
          outcome: input.outcome,
          notes: input.notes,
          onBehalf: right === 'ON_BEHALF',
        },
      });
    });
    return this.get(caller, decisionId);
  }

  // ---------------------------------------------------------------------------

  private async insert(
    tx: TenantTransactionClient,
    d: {
      id: string;
      prefix: string;
      title: string;
      context: string | null;
      initiativeId: string | null;
      requiredFrom: Role;
      requiredFromId: string | null;
      dueDate: string | null;
    },
  ) {
    const existing = await tx.decision.findMany({
      where: { reference: { startsWith: `${d.prefix}-` } },
      select: { reference: true },
    });
    const reference = nextReference(
      d.prefix,
      existing.map((e) => e.reference),
    );
    await tx.decision.create({
      data: {
        id: d.id,
        organisationId: TenantContext.require().organisationId,
        reference,
        title: d.title,
        context: d.context,
        initiativeId: d.initiativeId,
        requiredFrom: d.requiredFrom,
        requiredFromId: d.requiredFromId,
        dueDate: d.dueDate ? new Date(`${d.dueDate}T00:00:00Z`) : null,
      },
    });
    await recordAudit(tx, {
      action: 'DECISION_RAISED',
      entityType: 'Decision',
      entityId: d.id,
      after: { reference, title: d.title },
    });
  }

  private toView(
    viewer: AuthContext,
    row: DecisionRow,
    today: Date,
  ): DecisionView {
    const open = isOpen(row, today);
    return {
      id: row.id,
      reference: row.reference,
      title: row.title,
      context: row.context,
      kind: row.approval ? 'CHANGE_REQUEST' : 'DECISION',
      initiative: row.initiative
        ? {
            id: row.initiative.id,
            code: row.initiative.code,
            title: row.initiative.title,
          }
        : null,
      requiredFrom: row.requiredFrom,
      decisionOwner: toPersonRef(row.requiredFromMember),
      dueDate: toIsoDate(row.dueDate),
      overdueDays:
        open && row.dueDate ? Math.max(0, daysBetween(row.dueDate, today)) : 0,
      outcome: row.outcome,
      outcomeNotes: row.outcomeNotes,
      deferredUntil: toIsoDate(row.deferredUntil),
      decidedBy: toPersonRef(row.decidedBy),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      changeRequestId: row.approval?.id ?? null,
      canDecide:
        open &&
        decideRight(viewer, {
          requiredFrom: row.requiredFrom,
          requiredFromId: row.requiredFromId,
          requestedById: row.approval?.requestedById ?? null,
          isChangeRequest: row.approval !== null,
        }) !== null,
    };
  }

  /** Pending, or deferred to a date that has now come. */
  private openWhere(today: Date): Prisma.DecisionWhereInput {
    return {
      OR: [
        { outcome: 'PENDING' },
        { outcome: 'DEFERRED', deferredUntil: { lte: today } },
      ],
    };
  }

  private visibility(viewer: AuthContext): Prisma.DecisionWhereInput {
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

  private today(): Date {
    return new Date(`${toIsoDate(this.clock.now())}T00:00:00Z`);
  }
}
