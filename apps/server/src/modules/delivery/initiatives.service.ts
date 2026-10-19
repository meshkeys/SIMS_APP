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
import { canSeeInitiative } from '../../domain/access/initiative-visibility.js';
import { canOverrideHealth } from '../../domain/access/override-permission.js';
import type { HealthReason } from '../../domain/delivery/health.js';
import {
  allowedTransitions,
  isBaselineLocked,
} from '../../domain/delivery/lifecycle.js';
import {
  canChangeMilestonePlan,
  canWorkOnInitiative,
  deniedFields,
  relationTo,
} from '../../domain/delivery/permissions.js';
import { daysBetween } from '../../domain/delivery/progress.js';
import type {
  DependencyStatus,
  Severity,
} from '../../generated/prisma/enums.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import { TenantPrismaService } from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import { personSelect, toPersonRef } from '../people/person.js';
import { describeActivity } from './activity.js';
import { HealthRecalculationService } from './health-recalculation.service.js';
import {
  type DependencyView,
  INITIATIVE_FIELDS,
  type InitiativeDetail,
  type OverrideInput,
} from '@sims/contracts';

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const notFound = () =>
  new NotFoundException({
    code: 'INITIATIVE_NOT_FOUND',
    message: 'Initiative not found.',
  });

const endOfUtcDay = (isoDate: string) => new Date(`${isoDate}T23:59:59.999Z`);

@Injectable()
export class InitiativesService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly recalculation: HealthRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async detail(
    viewer: AuthContext,
    initiativeId: string,
  ): Promise<InitiativeDetail> {
    const db = this.db.client;
    const initiative = await db.initiative.findUnique({
      where: { id: initiativeId },
      include: {
        plan: { select: { id: true, name: true } },
        owner: personSelect,
        sponsor: personSelect,
        benefitsOwner: personSelect,
        overrideBy: personSelect,
        department: { select: { id: true, name: true } },
        objectiveLinks: {
          orderBy: [{ isPrimary: 'desc' }, { contributionWeight: 'desc' }],
          select: {
            contributionWeight: true,
            isPrimary: true,
            element: {
              select: { id: true, code: true, title: true, parentId: true },
            },
          },
        },
        milestones: {
          orderBy: [{ sortOrder: 'asc' }, { baselineDate: 'asc' }],
          include: {
            tasks: {
              orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
              include: { assignee: personSelect },
            },
          },
        },
        risks: {
          where: { status: 'OPEN' },
          include: {
            owner: personSelect,
            escalations: { where: { status: 'OPEN' }, select: { level: true } },
          },
        },
        dependsOn: {
          include: {
            toInitiative: { select: { id: true, code: true, title: true } },
          },
        },
        dependedOnBy: {
          include: {
            fromInitiative: { select: { id: true, code: true, title: true } },
          },
        },
        kpiLinks: {
          select: { kpi: { select: { id: true, code: true, name: true } } },
        },
        progressSnapshots: {
          orderBy: { asOf: 'asc' },
          select: { asOf: true, plannedProgress: true, verifiedProgress: true },
        },
      },
    });
    // Hidden sensitive initiatives answer "not found", never "forbidden".
    if (!initiative || !canSeeInitiative(viewer, initiative)) throw notFound();

    const now = this.clock.now();
    const milestoneIds = initiative.milestones.map((m) => m.id);
    const [evidence, events, pillar, rules] = await Promise.all([
      db.document.groupBy({
        by: ['entityId'],
        where: {
          entityType: 'Milestone',
          entityId: { in: milestoneIds },
          deletedAt: null,
        },
        _count: { _all: true },
      }),
      db.auditEvent.findMany({
        where: { entityId: { in: [initiative.id, ...milestoneIds] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.topLevelOf(
        initiative.objectiveLinks.find((l) => l.isPrimary)?.element ?? null,
      ),
      this.db.transaction((tx) => this.recalculation.loadActiveRules(tx)),
    ]);
    const actors = await db.membership.findMany({
      where: {
        id: {
          in: events.map((e) => e.actorId).filter((id): id is string => !!id),
        },
      },
      ...personSelect,
    });
    const actorById = new Map(actors.map((a) => [a.id, toPersonRef(a)]));
    const evidenceById = new Map(
      evidence.map((e) => [e.entityId, e._count._all]),
    );
    const milestoneTitles = new Map(
      initiative.milestones.map((m) => [m.id, m.title]),
    );

    const totalWeight = initiative.milestones.reduce(
      (sum, m) => sum + toNumber(m.weight),
      0,
    );
    const verified = toNumber(initiative.verifiedProgress);
    const planned = toNumber(initiative.plannedProgress);
    const overrideActive =
      initiative.healthOverride !== null &&
      initiative.overrideExpiresAt !== null &&
      initiative.overrideExpiresAt > now;
    const reasons = (initiative.healthReasons ??
      []) as unknown as HealthReason[];
    const overdue = reasons.find((reason) => reason.rule === 'UPDATE_OVERDUE');
    const baselineBudget = toNumber(initiative.baselineBudget);
    const spent = toNumber(initiative.spentToDate);

    const dependency = (
      other: { id: string; code: string; title: string },
      d: {
        status: DependencyStatus;
        blockedSince: Date | null;
        isCriticalPath: boolean;
      },
    ): DependencyView => ({
      initiativeId: other.id,
      code: other.code,
      title: other.title,
      status: d.status,
      blockedSince: toIsoDate(d.blockedSince),
      isCriticalPath: d.isCriticalPath,
    });

    // What the caller may do, from the same rules that enforce each action.
    const relation = relationTo(viewer, initiative);
    const baselineLocked = isBaselineLocked(initiative.status);
    const can = {
      changeStatus:
        relation === 'OFFICE' ? [...allowedTransitions(initiative.status)] : [],
      override:
        initiative.status === 'ACTIVE' &&
        canOverrideHealth(
          viewer,
          initiative,
          rules.config.overrides.minimumRole,
        ),
      edit: relation !== 'NONE',
      requestChange:
        baselineLocked &&
        relation !== 'NONE' &&
        initiative.status !== 'CLOSED' &&
        initiative.status !== 'CANCELLED',
      editFields: INITIATIVE_FIELDS.filter(
        (field) =>
          deniedFields(relation, initiative.status, [field]).length === 0,
      ),
      changeObjectives: relation === 'OFFICE',
      planMilestones: canChangeMilestonePlan(relation, initiative.status),
      manageWork: canWorkOnInitiative(relation),
    };

    return {
      can,
      id: initiative.id,
      code: initiative.code,
      title: initiative.title,
      description: initiative.description,
      businessCase: initiative.businessCase,
      scope: initiative.scope,
      status: initiative.status,
      priority: initiative.priority,
      isSensitive: initiative.isSensitive,
      plan: initiative.plan,
      contributesTo: initiative.objectiveLinks.map((link) => ({
        elementId: link.element.id,
        code: link.element.code,
        title: link.element.title,
        weight: toNumber(link.contributionWeight),
        isPrimary: link.isPrimary,
      })),
      pillar,
      owner: toPersonRef(initiative.owner),
      sponsor: toPersonRef(initiative.sponsor),
      benefitsOwner: toPersonRef(initiative.benefitsOwner),
      department: initiative.department,
      baseline: {
        start: toIsoDate(initiative.baselineStart),
        end: toIsoDate(initiative.baselineEnd),
      },
      forecastEnd: toIsoDate(initiative.forecastEnd),
      actualEnd: toIsoDate(initiative.actualEnd),
      budget: {
        baseline: baselineBudget,
        spent,
        spentPct:
          baselineBudget && spent !== null
            ? Math.round((spent / baselineBudget) * 100)
            : null,
      },
      lastVerifiedUpdateAt:
        initiative.lastVerifiedUpdateAt?.toISOString() ?? null,
      execution: {
        verified,
        planned,
        variancePp: Math.round((verified - planned) * 10) / 10,
      },
      health: {
        effective: overrideActive
          ? initiative.healthOverride!
          : initiative.calculatedHealth,
        calculated: initiative.calculatedHealth,
        reasons,
        override: overrideActive
          ? {
              health: initiative.healthOverride!,
              reason: initiative.overrideReason ?? '',
              by: toPersonRef(initiative.overrideBy),
              at: initiative.overrideAt?.toISOString() ?? null,
              expiresAt: initiative.overrideExpiresAt!.toISOString(),
            }
          : null,
        updateOverdue: overdue ? { detail: overdue.detail } : null,
      },
      impact: {
        score: toNumber(initiative.impactScore),
        summary: initiative.impactSummary,
        trajectory: initiative.trajectory,
      },
      milestones: initiative.milestones.map((m) => {
        const weight = toNumber(m.weight);
        const completion = toNumber(m.verifiedCompletion);
        const late =
          m.status !== 'COMPLETE' ? daysBetween(m.baselineDate, now) : 0;
        return {
          id: m.id,
          title: m.title,
          weight,
          isCritical: m.isCritical,
          status: m.status,
          baselineStartDate: toIsoDate(m.baselineStartDate),
          baselineDate: toIsoDate(m.baselineDate),
          forecastDate: toIsoDate(m.forecastDate),
          actualDate: toIsoDate(m.actualDate),
          claimedCompletion: toNumber(m.claimedCompletion),
          verifiedCompletion: completion,
          contribution: totalWeight
            ? Math.round(((weight * completion) / totalWeight) * 100) / 100
            : 0,
          overdueDays: Math.max(0, late),
          evidenceCount: evidenceById.get(m.id) ?? 0,
          tasks: m.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            assignee: toPersonRef(task.assignee),
            dueDate: toIsoDate(task.dueDate),
            completedAt: task.completedAt?.toISOString() ?? null,
          })),
        };
      }),
      risks: initiative.risks
        .sort(
          (a, b) =>
            SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
            a.title.localeCompare(b.title),
        )
        .map((risk) => ({
          id: risk.id,
          type: risk.type,
          title: risk.title,
          severity: risk.severity,
          status: risk.status,
          owner: toPersonRef(risk.owner),
          dueDate: toIsoDate(risk.dueDate),
          escalationLevel: risk.escalations.length
            ? Math.max(...risk.escalations.map((e) => e.level))
            : null,
        })),
      dependencies: {
        blockedBy: initiative.dependsOn.map((d) =>
          dependency(d.toInitiative, d),
        ),
        enables: initiative.dependedOnBy.map((d) =>
          dependency(d.fromInitiative, d),
        ),
      },
      kpis: initiative.kpiLinks.map((link) => link.kpi),
      progressHistory: initiative.progressSnapshots.map((s) => ({
        asOf: toIsoDate(s.asOf),
        planned: toNumber(s.plannedProgress),
        verified: toNumber(s.verifiedProgress),
      })),
      activity: events.map((event) => ({
        action: event.action,
        summary: describeActivity(event, milestoneTitles),
        at: event.createdAt.toISOString(),
        actor: event.actorId ? (actorById.get(event.actorId) ?? null) : null,
      })),
    };
  }

  /**
   * Sets a manual status with a mandatory reason and an expiry (at most the
   * organisation's limit). Who may do it comes from the active ruleset.
   */
  async setOverride(
    caller: AuthContext,
    initiativeId: string,
    input: OverrideInput,
  ): Promise<InitiativeDetail> {
    await this.db.transaction(async (tx) => {
      const initiative = await tx.initiative.findUnique({
        where: { id: initiativeId },
      });
      if (!initiative || !canSeeInitiative(caller, initiative))
        throw notFound();
      if (initiative.status !== 'ACTIVE') {
        throw new ConflictException({
          code: 'INITIATIVE_NOT_ACTIVE',
          message: 'Only active initiatives have a status to override.',
        });
      }
      const rules = (await this.recalculation.loadActiveRules(tx)).config
        .overrides;
      if (!canOverrideHealth(caller, initiative, rules.minimumRole)) {
        throw new ForbiddenException({
          code: 'CANNOT_OVERRIDE',
          message: 'You cannot override the status of this initiative.',
        });
      }
      if (input.health === initiative.calculatedHealth) {
        throw invalid(
          'health',
          'This is already the calculated status. Remove the override instead.',
        );
      }

      const now = this.clock.now();
      const latest = new Date(now.getTime() + rules.expiryDays * 86_400_000);
      const expiresAt = input.expiresAt ? endOfUtcDay(input.expiresAt) : latest;
      if (expiresAt <= now)
        throw invalid('expiresAt', 'Choose a date in the future');
      if (expiresAt > endOfUtcDay(toIsoDate(latest))) {
        throw invalid(
          'expiresAt',
          `Overrides can last at most ${rules.expiryDays} days (until ${toIsoDate(latest)})`,
        );
      }

      await tx.initiative.update({
        where: { id: initiativeId },
        data: {
          healthOverride: input.health,
          overrideReason: input.reason,
          overrideById: caller.membershipId,
          overrideAt: now,
          overrideExpiresAt: expiresAt,
        },
      });
      await recordAudit(tx, {
        action: 'STATUS_OVERRIDE',
        entityType: 'Initiative',
        entityId: initiativeId,
        before: {
          health: initiative.healthOverride ?? initiative.calculatedHealth,
        },
        after: {
          health: input.health,
          reason: input.reason,
          expiresAt: expiresAt.toISOString(),
        },
      });
    });
    return this.detail(caller, initiativeId);
  }

  async clearOverride(
    caller: AuthContext,
    initiativeId: string,
  ): Promise<InitiativeDetail> {
    await this.db.transaction(async (tx) => {
      const initiative = await tx.initiative.findUnique({
        where: { id: initiativeId },
      });
      if (!initiative || !canSeeInitiative(caller, initiative))
        throw notFound();
      const rules = (await this.recalculation.loadActiveRules(tx)).config
        .overrides;
      if (!canOverrideHealth(caller, initiative, rules.minimumRole)) {
        throw new ForbiddenException({
          code: 'CANNOT_OVERRIDE',
          message: 'You cannot change the status of this initiative.',
        });
      }
      if (initiative.healthOverride === null) {
        throw new ConflictException({
          code: 'NO_OVERRIDE',
          message: 'This initiative has no override.',
        });
      }
      await tx.initiative.update({
        where: { id: initiativeId },
        data: {
          healthOverride: null,
          overrideReason: null,
          overrideById: null,
          overrideAt: null,
          overrideExpiresAt: null,
        },
      });
      await recordAudit(tx, {
        action: 'OVERRIDE_REMOVED',
        entityType: 'Initiative',
        entityId: initiativeId,
        before: {
          health: initiative.healthOverride,
          reason: initiative.overrideReason,
        },
        after: { health: initiative.calculatedHealth },
      });
    });
    return this.detail(caller, initiativeId);
  }

  private async topLevelOf(
    element: {
      id: string;
      code: string;
      title: string;
      parentId: string | null;
    } | null,
  ): Promise<{ id: string; code: string; title: string } | null> {
    let node = element;
    // Bounded by the framework depth (≤ 10).
    while (node?.parentId) {
      node = await this.db.client.strategyElement.findUnique({
        where: { id: node.parentId },
        select: { id: true, code: true, title: true, parentId: true },
      });
    }
    return node ? { id: node.id, code: node.code, title: node.title } : null;
  }
}

function invalid(path: string, message: string) {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Some fields are missing or invalid.',
    errors: [{ path, message, code: 'custom' }],
  });
}
