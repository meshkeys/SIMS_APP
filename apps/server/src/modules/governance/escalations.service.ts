import {
  BadRequestException,
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
import { nextReference } from '../../domain/governance/decisions.js';
import {
  autoSteps,
  type Decider,
  deciderFor,
  daysToNextLevel,
  isDecider,
  startLevel,
} from '../../domain/governance/escalation-ladder.js';
import type { RulesetConfig } from '../../domain/rulesets/ruleset-config.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  DependencyStatus,
  EscalationChangeReason,
  Role,
} from '../../generated/prisma/enums.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import { loadActiveRules } from '../delivery/element-rollups.js';
import { seesAllInitiatives } from '../delivery/visibility.js';
import { loadForWrite } from '../delivery/write-access.js';
import { personSelect, toPersonRef } from '../people/person.js';
import type {
  DependencyQuery,
  EscalationCentre,
  EscalationDetail,
  EscalationItem,
  EscalationQuery,
  MoveEscalationInput,
  PortfolioDependency,
  RaiseEscalationInput,
  ResolveEscalationInput,
  SweepResult,
  WithdrawEscalationInput,
} from '@sims/contracts';

type Ladder = RulesetConfig['escalation'];

const initiativeRef = { select: { id: true, code: true, title: true } };

const itemInclude = {
  initiative: {
    select: {
      id: true,
      code: true,
      title: true,
      ownerId: true,
      sponsorId: true,
    },
  },
  decisionFrom: personSelect,
  raisedBy: personSelect,
  riskIssue: { select: { id: true, type: true, title: true } },
  dependency: {
    select: {
      id: true,
      fromInitiative: initiativeRef,
      toInitiative: initiativeRef,
    },
  },
} as const;

type ItemRow = Prisma.EscalationGetPayload<{ include: typeof itemInclude }>;

const escalationNotFound = () =>
  new NotFoundException({
    code: 'ESCALATION_NOT_FOUND',
    message: 'Escalation not found.',
  });

const isOffice = (caller: AuthContext) =>
  caller.roles.includes('STRATEGY_OFFICE') ||
  caller.roles.includes('SYSTEM_ADMIN');

/**
 * The escalation ladder: what is preventing execution, who must decide, and
 * how long it has waited. Unresolved items move up the organisation's ladder
 * on its timings; people can also move them up or down, resolve them, or
 * withdraw ones raised by mistake. Every level change is kept as history.
 */
@Injectable()
export class EscalationsService {
  constructor(
    private readonly db: TenantPrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(
    viewer: AuthContext,
    query: EscalationQuery,
  ): Promise<EscalationCentre> {
    const now = this.clock.now();
    const ladder = await this.db.transaction(async (tx) => {
      const rules = await loadActiveRules(tx);
      await this.catchUpIn(tx, rules, now);
      return rules.config.escalation;
    });

    const visible = this.visibility(viewer);
    const where: Prisma.EscalationWhereInput = {
      AND: [
        visible,
        { status: { in: query.status ?? ['OPEN'] } },
        query.level ? { level: query.level } : {},
        query.initiativeId ? { initiativeId: query.initiativeId } : {},
      ],
    };
    const db = this.db.client;
    const [rows, openByLevel] = await Promise.all([
      db.escalation.findMany({
        where,
        include: itemInclude,
        orderBy: [{ raisedAt: 'asc' }, { reference: 'asc' }],
      }),
      db.escalation.groupBy({
        by: ['level'],
        where: { AND: [visible, { status: 'OPEN' }] },
        _count: { _all: true },
      }),
    ]);
    const openAt = (level: number) =>
      openByLevel.find((c) => c.level === level)?._count._all ?? 0;

    return {
      ladder: ladder.levels.map((level) => ({
        level: level.level,
        name: level.name,
        description: level.description ?? null,
        decidedBy: level.decidedBy,
        autoEscalateAfterDays: level.autoEscalateAfterDays,
        open: openAt(level.level),
      })),
      criticalStartsAtLevel: ladder.criticalStartsAtLevel,
      items: rows.map((row) => this.toItem(row, viewer, ladder, now)),
      total: rows.length,
      can: { raisePortfolio: isOffice(viewer) },
    };
  }

  async get(
    viewer: AuthContext,
    escalationId: string,
  ): Promise<EscalationDetail> {
    const now = this.clock.now();
    return this.db.transaction(async (tx) => {
      const rules = await loadActiveRules(tx);
      await this.catchUpIn(tx, rules, now);
      const row = await tx.escalation.findFirst({
        where: { AND: [{ id: escalationId }, this.visibility(viewer)] },
        include: {
          ...itemInclude,
          changes: {
            orderBy: { createdAt: 'asc' },
            include: { actor: personSelect },
          },
        },
      });
      if (!row) throw escalationNotFound();
      return {
        ...this.toItem(row, viewer, rules.config.escalation, now),
        description: row.description,
        history: row.changes.map((change) => ({
          fromLevel: change.fromLevel,
          toLevel: change.toLevel,
          toLevelName: change.toLevelName,
          reason: change.reason,
          note: change.note,
          actor: toPersonRef(change.actor),
          at: change.createdAt.toISOString(),
        })),
      };
    });
  }

  async raise(
    caller: AuthContext,
    input: RaiseEscalationInput,
  ): Promise<EscalationDetail> {
    const id = uuidv7();
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      let initiativeId = input.initiativeId;
      let source: Prisma.EscalationCreateInput['source'] = input.source;

      if (input.riskIssueId) {
        const risk = await tx.riskIssue.findUnique({
          where: { id: input.riskIssueId },
          select: {
            status: true,
            initiativeId: true,
            initiative: {
              select: {
                isSensitive: true,
                ownerId: true,
                sponsorId: true,
                benefitsOwnerId: true,
              },
            },
            escalations: {
              where: { status: 'OPEN' },
              select: { reference: true },
            },
          },
        });
        if (
          !risk ||
          (risk.initiative && !canSeeInitiative(caller, risk.initiative))
        ) {
          throw invalid('riskIssueId', 'Choose a logged risk or issue');
        }
        if (initiativeId && risk.initiativeId !== initiativeId) {
          throw invalid(
            'initiativeId',
            'The risk belongs to another initiative',
          );
        }
        if (risk.status !== 'OPEN') {
          throw new ConflictException({
            code: 'RISK_NOT_OPEN',
            message: 'Only open risks and issues can be escalated.',
          });
        }
        if (risk.escalations[0]) {
          throw new ConflictException({
            code: 'ALREADY_ESCALATED',
            message: `This is already escalated as ${risk.escalations[0].reference}.`,
          });
        }
        initiativeId = risk.initiativeId;
        source = 'RISK_ISSUE';
      }

      let initiative: {
        ownerId: string | null;
        sponsorId: string | null;
      } | null = null;
      if (initiativeId) {
        initiative = (await loadForWrite(tx, caller, initiativeId)).initiative;
      } else if (!isOffice(caller)) {
        throw new ForbiddenException({
          code: 'STRATEGY_OFFICE_ONLY',
          message:
            'Only the Strategy Office raises portfolio-level escalations.',
        });
      }

      const rules = await loadActiveRules(tx);
      const ladder = rules.config.escalation;
      const start = startLevel(input.severity, ladder);
      const decider = await this.deciderAt(tx, ladder, start.level, initiative);
      const existing = await tx.escalation.findMany({
        select: { reference: true },
      });
      const reference = nextReference(
        'ESC',
        existing.map((e) => e.reference),
      );
      const { organisationId } = TenantContext.require();
      await tx.escalation.create({
        data: {
          id,
          organisationId,
          reference,
          source,
          title: input.title,
          description: input.description,
          severity: input.severity,
          initiativeId,
          riskIssueId: input.riskIssueId,
          level: start.level,
          raisedById: caller.membershipId,
          ...decider,
          raisedAt: now,
          levelChangedAt: now,
        },
      });
      await this.logChange(tx, {
        escalationId: id,
        fromLevel: null,
        toLevel: start.level,
        ladder,
        rulesetVersion: rules.version,
        reason: start.reason,
        note: null,
        actorId: caller.membershipId,
        at: now,
      });
      await recordAudit(tx, {
        action: 'ESCALATION_RAISED',
        entityType: 'Escalation',
        entityId: id,
        after: {
          reference,
          title: input.title,
          severity: input.severity,
          level: start.level,
          initiativeId,
        },
      });
    });
    return this.get(caller, id);
  }

  escalate(
    caller: AuthContext,
    escalationId: string,
    input: MoveEscalationInput,
  ) {
    return this.move(caller, escalationId, +1, input.note);
  }

  deEscalate(
    caller: AuthContext,
    escalationId: string,
    input: MoveEscalationInput,
  ) {
    return this.move(caller, escalationId, -1, input.note);
  }

  async resolve(
    caller: AuthContext,
    escalationId: string,
    input: ResolveEscalationInput,
  ): Promise<EscalationDetail> {
    await this.close(caller, escalationId, 'RESOLVED', input.resolution);
    return this.get(caller, escalationId);
  }

  async withdraw(
    caller: AuthContext,
    escalationId: string,
    input: WithdrawEscalationInput,
  ): Promise<EscalationDetail> {
    await this.close(caller, escalationId, 'WITHDRAWN', input.reason);
    return this.get(caller, escalationId);
  }

  /** Applies every automatic move that is due now. */
  async sweep(): Promise<SweepResult> {
    const now = this.clock.now();
    const moved = await this.db.transaction(async (tx) =>
      this.catchUpIn(tx, await loadActiveRules(tx), now),
    );
    return { moved };
  }

  /**
   * Moves every open item that is owed an automatic step up the ladder,
   * recording each step at the moment it fell due. Safe to run any number
   * of times, including concurrently: an item only moves from the level it
   * was read at. Runs before the escalation centre and the dashboard are
   * read, until scheduled jobs run it (slice 11).
   */
  async catchUpIn(
    tx: TenantTransactionClient,
    rules: { version: number | null; config: RulesetConfig },
    now: Date,
  ): Promise<number> {
    const ladder = rules.config.escalation;
    const open = await tx.escalation.findMany({
      where: { status: 'OPEN', level: { lt: ladder.levels.length } },
      select: {
        id: true,
        level: true,
        levelChangedAt: true,
        initiative: { select: { ownerId: true, sponsorId: true } },
      },
    });
    let moved = 0;
    // Sequential on purpose: a transaction is one connection.
    for (const item of open) {
      const steps = autoSteps(item, ladder, now);
      const last = steps.at(-1);
      if (!last) continue;
      const decider = await this.deciderAt(
        tx,
        ladder,
        last.level,
        item.initiative,
      );
      const updated = await tx.escalation.updateMany({
        where: { id: item.id, level: item.level, status: 'OPEN' },
        data: { level: last.level, levelChangedAt: last.dueAt, ...decider },
      });
      if (updated.count === 0) continue;
      let from = item.level;
      for (const step of steps) {
        await this.logChange(tx, {
          escalationId: item.id,
          fromLevel: from,
          toLevel: step.level,
          ladder,
          rulesetVersion: rules.version,
          reason: 'AUTO_TIMEOUT',
          note: null,
          actorId: null,
          at: step.dueAt,
        });
        from = step.level;
      }
      moved += 1;
    }
    return moved;
  }

  /** Blocked and at-risk dependencies (by default) between initiatives the viewer can see. */
  async dependencies(
    viewer: AuthContext,
    query: DependencyQuery,
  ): Promise<PortfolioDependency[]> {
    const statuses: DependencyStatus[] = query.status ?? ['BLOCKED', 'AT_RISK'];
    const rows = await this.db.client.dependency.findMany({
      where: { status: { in: statuses } },
      include: {
        fromInitiative: {
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
        toInitiative: {
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
      },
    });
    const rank: Record<DependencyStatus, number> = {
      BLOCKED: 0,
      AT_RISK: 1,
      ON_TRACK: 2,
      RESOLVED: 3,
    };
    const ref = (i: { id: string; code: string; title: string }) => ({
      id: i.id,
      code: i.code,
      title: i.title,
    });
    return rows
      .filter(
        (d) =>
          canSeeInitiative(viewer, d.fromInitiative) &&
          canSeeInitiative(viewer, d.toInitiative),
      )
      .sort(
        (a, b) =>
          rank[a.status] - rank[b.status] ||
          Number(b.isCriticalPath) - Number(a.isCriticalPath) ||
          (a.blockedSince?.getTime() ?? Infinity) -
            (b.blockedSince?.getTime() ?? Infinity) ||
          a.fromInitiative.code.localeCompare(b.fromInitiative.code),
      )
      .map((d) => ({
        id: d.id,
        from: ref(d.fromInitiative),
        to: ref(d.toInitiative),
        description: d.description,
        status: d.status,
        isCriticalPath: d.isCriticalPath,
        blockedSince: d.blockedSince?.toISOString() ?? null,
        neededBy: toIsoDate(d.neededBy),
      }));
  }

  // ---------------------------------------------------------------------------

  private async move(
    caller: AuthContext,
    escalationId: string,
    direction: 1 | -1,
    note: string,
  ): Promise<EscalationDetail> {
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      const rules = await loadActiveRules(tx);
      const ladder = rules.config.escalation;
      const item = await this.openForAction(tx, caller, escalationId);
      if (!isDecider(caller, item) && !isOffice(caller)) {
        throw notDecider();
      }
      const to = item.level + direction;
      if (direction > 0 && to > ladder.levels.length) {
        throw new ConflictException({
          code: 'TOP_OF_LADDER',
          message: `${item.reference} is already at the top of the ladder.`,
        });
      }
      if (direction < 0 && to < 1) {
        throw new ConflictException({
          code: 'BOTTOM_OF_LADDER',
          message: `${item.reference} is already at the first level.`,
        });
      }
      const decider = await this.deciderAt(tx, ladder, to, item.initiative);
      await tx.escalation.update({
        where: { id: escalationId },
        data: { level: to, levelChangedAt: now, ...decider },
      });
      await this.logChange(tx, {
        escalationId,
        fromLevel: item.level,
        toLevel: to,
        ladder,
        rulesetVersion: rules.version,
        reason: direction > 0 ? 'MANUAL' : 'DE_ESCALATED',
        note,
        actorId: caller.membershipId,
        at: now,
      });
      await recordAudit(tx, {
        action: direction > 0 ? 'ESCALATED' : 'DE_ESCALATED',
        entityType: 'Escalation',
        entityId: escalationId,
        before: { level: item.level },
        after: { level: to, note },
      });
    });
    return this.get(caller, escalationId);
  }

  private async close(
    caller: AuthContext,
    escalationId: string,
    status: 'RESOLVED' | 'WITHDRAWN',
    text: string,
  ) {
    await this.db.transaction(async (tx) => {
      const item = await this.openForAction(tx, caller, escalationId);
      const allowed =
        isOffice(caller) ||
        (status === 'RESOLVED'
          ? isDecider(caller, item)
          : item.raisedById === caller.membershipId);
      if (!allowed) {
        throw status === 'RESOLVED'
          ? notDecider()
          : new ForbiddenException({
              code: 'NOT_RAISER',
              message:
                'Only whoever raised it, or the Strategy Office, can withdraw an escalation.',
            });
      }
      await tx.escalation.update({
        where: { id: escalationId },
        data: { status, resolvedAt: this.clock.now(), resolution: text },
      });
      await recordAudit(tx, {
        action:
          status === 'RESOLVED'
            ? 'ESCALATION_RESOLVED'
            : 'ESCALATION_WITHDRAWN',
        entityType: 'Escalation',
        entityId: escalationId,
        before: { status: 'OPEN', level: item.level },
        after: { status, text },
      });
    });
  }

  /** An open escalation the caller may see, for a change. */
  private async openForAction(
    tx: TenantTransactionClient,
    caller: AuthContext,
    escalationId: string,
  ) {
    const item = await tx.escalation.findFirst({
      where: { AND: [{ id: escalationId }, this.visibility(caller)] },
      select: {
        reference: true,
        level: true,
        status: true,
        raisedById: true,
        decisionFromId: true,
        decisionFromRole: true,
        initiative: { select: { ownerId: true, sponsorId: true } },
      },
    });
    if (!item) throw escalationNotFound();
    if (item.status !== 'OPEN') {
      throw new ConflictException({
        code: 'ESCALATION_CLOSED',
        message: `${item.reference} is already ${item.status.toLowerCase()}.`,
      });
    }
    return item;
  }

  private async deciderAt(
    tx: TenantTransactionClient,
    ladder: Ladder,
    level: number,
    initiative: { ownerId: string | null; sponsorId: string | null } | null,
  ): Promise<Decider> {
    const config = ladder.levels.find((l) => l.level === level);
    if (!config)
      return { decisionFromId: null, decisionFromRole: 'STRATEGY_OFFICE' };
    if (config.decidedBy.type !== 'ROLE')
      return deciderFor(config, initiative, () => []);
    const role = config.decidedBy.role;
    const holders = await tx.membership.findMany({
      where: { status: 'ACTIVE', roles: { has: role } },
      select: { id: true },
    });
    return deciderFor(config, initiative, (r: Role) =>
      r === role ? holders.map((h) => h.id) : [],
    );
  }

  private async logChange(
    tx: TenantTransactionClient,
    change: {
      escalationId: string;
      fromLevel: number | null;
      toLevel: number;
      ladder: Ladder;
      rulesetVersion: number | null;
      reason: EscalationChangeReason;
      note: string | null;
      actorId: string | null;
      at: Date;
    },
  ) {
    await tx.escalationLevelChange.create({
      data: {
        id: uuidv7(),
        organisationId: TenantContext.require().organisationId,
        escalationId: change.escalationId,
        fromLevel: change.fromLevel,
        toLevel: change.toLevel,
        toLevelName: levelName(change.ladder, change.toLevel),
        rulesetVersion: change.rulesetVersion,
        reason: change.reason,
        note: change.note,
        actorId: change.actorId,
        createdAt: change.at,
      },
    });
  }

  private toItem(
    row: ItemRow,
    viewer: AuthContext,
    ladder: Ladder,
    now: Date,
  ): EscalationItem {
    const open = row.status === 'OPEN';
    const decides = isDecider(viewer, row) || isOffice(viewer);
    const initiative = row.initiative
      ? {
          id: row.initiative.id,
          code: row.initiative.code,
          title: row.initiative.title,
        }
      : null;
    return {
      id: row.id,
      reference: row.reference,
      title: row.title,
      severity: row.severity,
      level: row.level,
      levelName: levelName(ladder, row.level),
      daysAtLevel: Math.max(0, daysBetween(row.levelChangedAt, now)),
      ageDays: Math.max(0, daysBetween(row.raisedAt, now)),
      initiative,
      decisionFrom: toPersonRef(row.decisionFrom),
      decisionFromRole: row.decisionFromRole,
      source: row.source,
      status: row.status,
      raisedAt: row.raisedAt.toISOString(),
      raisedBy: toPersonRef(row.raisedBy),
      riskIssue: row.riskIssue,
      dependency: row.dependency
        ? {
            id: row.dependency.id,
            from: row.dependency.fromInitiative,
            to: row.dependency.toInitiative,
          }
        : null,
      nextLevelInDays: open ? daysToNextLevel(row, ladder, now) : null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolution: row.resolution,
      can: {
        escalate: open && decides && row.level < ladder.levels.length,
        deEscalate: open && decides && row.level > 1,
        resolve: open && decides,
        withdraw:
          open && (isOffice(viewer) || row.raisedById === viewer.membershipId),
      },
    };
  }

  private visibility(viewer: AuthContext): Prisma.EscalationWhereInput {
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
}

/** The level's name on the current ladder ("Level 5" if the ladder was shortened). */
const levelName = (ladder: Ladder, level: number) =>
  ladder.levels.find((l) => l.level === level)?.name ?? `Level ${level}`;

const notDecider = () =>
  new ForbiddenException({
    code: 'NOT_DECIDER',
    message:
      'Only whoever must decide at this level, or the Strategy Office, can do that.',
  });

const invalid = (path: string, message: string) =>
  new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Some fields are missing or invalid.',
    errors: [{ path, message, code: 'custom' }],
  });
