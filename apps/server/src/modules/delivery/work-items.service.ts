import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { toIsoDate, toNumber } from '../../common/data/numbers.js';
import { isUniqueViolation } from '../../common/data/prisma-errors.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { canSeeInitiative } from '../../domain/access/initiative-visibility.js';
import { findDependencyCycle } from '../../domain/delivery/dependencies.js';
import { canChangeMilestonePlan } from '../../domain/delivery/permissions.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import { assertActiveMembers } from '../people/person.js';
import { HealthRecalculationService } from './health-recalculation.service.js';
import { InitiativesService } from './initiatives.service.js';
import {
  baselineLocked,
  invalidField,
  loadForWrite,
  notYourInitiative,
  toDate,
} from './write-access.js';
import type {
  CreateDependencyInput,
  CreateMilestoneInput,
  CreateTaskInput,
  InitiativeDetail,
  UpdateDependencyInput,
  UpdateMilestoneInput,
  UpdateTaskInput,
} from '@sims/contracts';

/** Changing these alters the agreed plan (locked once delivery starts). */
const PLAN_FIELDS = [
  'weight',
  'baselineStartDate',
  'baselineDate',
  'isCritical',
  'evidenceRequired',
];

const notFound = (what: 'MILESTONE' | 'TASK' | 'DEPENDENCY') =>
  new NotFoundException({
    code: `${what}_NOT_FOUND`,
    message: `${what.charAt(0)}${what.slice(1).toLowerCase()} not found.`,
  });

/**
 * Milestones, tasks and dependencies of an initiative. Every change that can
 * move progress or health recalculates the initiative in the same transaction.
 */
@Injectable()
export class WorkItemsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly initiatives: InitiativesService,
    private readonly recalculation: HealthRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // ---------------------------------------------------------------- milestones

  async addMilestone(
    caller: AuthContext,
    initiativeId: string,
    input: CreateMilestoneInput,
  ): Promise<InitiativeDetail> {
    await this.db.transaction(async (tx) => {
      const { initiative, relation } = await loadForWrite(
        tx,
        caller,
        initiativeId,
      );
      if (!canChangeMilestonePlan(relation, initiative.status))
        throw baselineLocked('The milestone plan');

      const last = await tx.milestone.findFirst({
        where: { initiativeId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      const id = uuidv7();
      await tx.milestone.create({
        data: {
          id,
          organisationId: TenantContext.require().organisationId,
          initiativeId,
          title: input.title,
          weight: input.weight,
          isCritical: input.isCritical,
          evidenceRequired: input.evidenceRequired,
          baselineStartDate: toDate(input.baselineStartDate),
          baselineDate: toDate(input.baselineDate)!,
          forecastDate: toDate(input.forecastDate),
          sortOrder: input.sortOrder ?? (last ? last.sortOrder + 1 : 0),
        },
      });
      await recordAudit(tx, {
        action: 'MILESTONE_ADDED',
        entityType: 'Milestone',
        entityId: id,
        after: {
          initiative: initiative.code,
          title: input.title,
          weight: input.weight,
          baselineDate: input.baselineDate,
        },
      });
      await this.recalculation.recalculateIn(tx, [initiativeId]);
    });
    return this.initiatives.detail(caller, initiativeId);
  }

  async updateMilestone(
    caller: AuthContext,
    milestoneId: string,
    input: UpdateMilestoneInput,
  ): Promise<InitiativeDetail> {
    const initiativeId = await this.db.transaction(async (tx) => {
      const milestone = await tx.milestone.findUnique({
        where: { id: milestoneId },
      });
      if (!milestone) throw notFound('MILESTONE');
      const { initiative, relation } = await loadForWrite(
        tx,
        caller,
        milestone.initiativeId,
      );

      const changed = Object.keys(input);
      if (
        changed.some((f) => PLAN_FIELDS.includes(f)) &&
        !canChangeMilestonePlan(relation, initiative.status)
      ) {
        throw baselineLocked('The milestone plan');
      }
      const start =
        input.baselineStartDate !== undefined
          ? input.baselineStartDate
          : toIsoDate(milestone.baselineStartDate);
      const due = input.baselineDate ?? toIsoDate(milestone.baselineDate);
      if (start && due < start)
        throw invalidField(
          'baselineDate',
          'The due date must be on or after the start date',
        );

      await tx.milestone.update({
        where: { id: milestoneId },
        data: {
          ...input,
          baselineStartDate: toDate(input.baselineStartDate),
          baselineDate: toDate(input.baselineDate) ?? undefined,
          forecastDate: toDate(input.forecastDate),
        },
      });
      const before = Object.fromEntries(
        changed.map((key) => [
          key,
          (milestone as Record<string, unknown>)[key],
        ]),
      );
      // A forecast move gets its own event: it is what the activity trail reports.
      if (input.forecastDate !== undefined && changed.length === 1) {
        await recordAudit(tx, {
          action: 'MILESTONE_FORECAST_CHANGED',
          entityType: 'Milestone',
          entityId: milestoneId,
          before: { forecastDate: toIsoDate(milestone.forecastDate) },
          after: { forecastDate: input.forecastDate },
        });
      } else {
        await recordAudit(tx, {
          action: 'MILESTONE_UPDATED',
          entityType: 'Milestone',
          entityId: milestoneId,
          before,
          after: input,
        });
      }
      await this.recalculation.recalculateIn(tx, [initiative.id]);
      return initiative.id;
    });
    return this.initiatives.detail(caller, initiativeId);
  }

  /** Removes a milestone that has no verified progress or reported figures. */
  async removeMilestone(
    caller: AuthContext,
    milestoneId: string,
  ): Promise<InitiativeDetail> {
    const initiativeId = await this.db.transaction(async (tx) => {
      const milestone = await tx.milestone.findUnique({
        where: { id: milestoneId },
        include: { _count: { select: { updateLines: true } } },
      });
      if (!milestone) throw notFound('MILESTONE');
      const { initiative, relation } = await loadForWrite(
        tx,
        caller,
        milestone.initiativeId,
      );
      if (!canChangeMilestonePlan(relation, initiative.status))
        throw baselineLocked('The milestone plan');
      if (
        toNumber(milestone.verifiedCompletion) > 0 ||
        milestone._count.updateLines > 0
      ) {
        throw new ConflictException({
          code: 'MILESTONE_HAS_PROGRESS',
          message: `"${milestone.title}" has reported or verified progress, so it is kept for the record.`,
        });
      }
      await tx.milestone.delete({ where: { id: milestoneId } });
      await recordAudit(tx, {
        action: 'MILESTONE_REMOVED',
        entityType: 'Milestone',
        entityId: milestoneId,
        before: {
          initiative: initiative.code,
          title: milestone.title,
          weight: toNumber(milestone.weight),
        },
      });
      await this.recalculation.recalculateIn(tx, [initiative.id]);
      return initiative.id;
    });
    return this.initiatives.detail(caller, initiativeId);
  }

  // --------------------------------------------------------------------- tasks

  async addTask(
    caller: AuthContext,
    milestoneId: string,
    input: CreateTaskInput,
  ): Promise<InitiativeDetail> {
    const initiativeId = await this.db.transaction(async (tx) => {
      const milestone = await tx.milestone.findUnique({
        where: { id: milestoneId },
        select: { initiativeId: true, title: true },
      });
      if (!milestone) throw notFound('MILESTONE');
      await loadForWrite(tx, caller, milestone.initiativeId);
      await assertActiveMembers(tx, { assigneeId: input.assigneeId });
      const id = uuidv7();
      await tx.task.create({
        data: {
          id,
          organisationId: TenantContext.require().organisationId,
          milestoneId,
          title: input.title,
          assigneeId: input.assigneeId,
          dueDate: toDate(input.dueDate),
        },
      });
      await recordAudit(tx, {
        action: 'TASK_ADDED',
        entityType: 'Task',
        entityId: id,
        after: { milestone: milestone.title, title: input.title },
      });
      return milestone.initiativeId;
    });
    return this.initiatives.detail(caller, initiativeId);
  }

  /**
   * The initiative's owner, sponsor and the Strategy Office manage tasks;
   * the person a task is assigned to may update its status.
   */
  async updateTask(
    caller: AuthContext,
    taskId: string,
    input: UpdateTaskInput,
  ): Promise<InitiativeDetail> {
    const initiativeId = await this.db.transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: taskId },
        include: { milestone: { select: { initiativeId: true } } },
      });
      if (!task) throw notFound('TASK');
      const { initiative, relation } = await loadForWrite(
        tx,
        caller,
        task.milestone.initiativeId,
        { requireRelation: false },
      );
      const isAssignee = task.assigneeId === caller.membershipId;
      const statusOnly = Object.keys(input).every((key) => key === 'status');
      if (relation === 'NONE' && !(isAssignee && statusOnly))
        throw notYourInitiative();
      await assertActiveMembers(tx, { assigneeId: input.assigneeId });

      const now = this.clock.now();
      await tx.task.update({
        where: { id: taskId },
        data: {
          ...input,
          dueDate: toDate(input.dueDate),
          ...(input.status
            ? {
                completedAt:
                  input.status === 'DONE' ? (task.completedAt ?? now) : null,
              }
            : {}),
        },
      });
      await recordAudit(tx, {
        action:
          input.status === 'DONE' && task.status !== 'DONE'
            ? 'TASK_COMPLETED'
            : 'TASK_UPDATED',
        entityType: 'Task',
        entityId: taskId,
        before: Object.fromEntries(
          Object.keys(input).map((key) => [
            key,
            (task as Record<string, unknown>)[key],
          ]),
        ),
        after: input,
      });
      return initiative.id;
    });
    return this.initiatives.detail(caller, initiativeId);
  }

  async removeTask(
    caller: AuthContext,
    taskId: string,
  ): Promise<InitiativeDetail> {
    const initiativeId = await this.db.transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: taskId },
        include: { milestone: { select: { initiativeId: true } } },
      });
      if (!task) throw notFound('TASK');
      await loadForWrite(tx, caller, task.milestone.initiativeId);
      await tx.task.delete({ where: { id: taskId } });
      await recordAudit(tx, {
        action: 'TASK_REMOVED',
        entityType: 'Task',
        entityId: taskId,
        before: { title: task.title },
      });
      return task.milestone.initiativeId;
    });
    return this.initiatives.detail(caller, initiativeId);
  }

  // -------------------------------------------------------------- dependencies

  /** Records that this initiative waits on another; refuses loops. */
  async addDependency(
    caller: AuthContext,
    initiativeId: string,
    input: CreateDependencyInput,
  ): Promise<InitiativeDetail> {
    try {
      await this.db.transaction(async (tx) => {
        const { initiative } = await loadForWrite(tx, caller, initiativeId);
        const target = await tx.initiative.findUnique({
          where: { id: input.toInitiativeId },
          select: {
            id: true,
            code: true,
            planId: true,
            isSensitive: true,
            ownerId: true,
            sponsorId: true,
            benefitsOwnerId: true,
          },
        });
        if (
          !target ||
          !canSeeInitiative(caller, target) ||
          target.planId !== initiative.planId
        ) {
          throw invalidField(
            'toInitiativeId',
            'Choose an initiative in the same plan',
          );
        }
        await this.assertNoCycle(
          tx,
          initiative.planId,
          initiative.id,
          target.id,
        );

        const id = uuidv7();
        await tx.dependency.create({
          data: {
            id,
            organisationId: TenantContext.require().organisationId,
            fromInitiativeId: initiative.id,
            toInitiativeId: target.id,
            description: input.description,
            isCriticalPath: input.isCriticalPath,
            neededBy: toDate(input.neededBy),
            status: input.status,
            blockedSince: input.status === 'BLOCKED' ? this.clock.now() : null,
          },
        });
        await recordAudit(tx, {
          action: 'DEPENDENCY_ADDED',
          entityType: 'Initiative',
          entityId: initiative.id,
          after: {
            waitsOn: target.code,
            status: input.status,
            isCriticalPath: input.isCriticalPath,
          },
        });
        await this.recalculation.recalculateIn(tx, [initiative.id]);
      });
    } catch (error) {
      if (isUniqueViolation(error, 'fromInitiativeId')) {
        throw new ConflictException({
          code: 'DEPENDENCY_EXISTS',
          message: 'This dependency is already recorded.',
        });
      }
      throw error;
    }
    return this.initiatives.detail(caller, initiativeId);
  }

  /** Becoming BLOCKED starts the "blocked since" clock; leaving BLOCKED stops it. */
  async updateDependency(
    caller: AuthContext,
    dependencyId: string,
    input: UpdateDependencyInput,
  ): Promise<InitiativeDetail> {
    const initiativeId = await this.db.transaction(async (tx) => {
      const dependency = await tx.dependency.findUnique({
        where: { id: dependencyId },
      });
      if (!dependency) throw notFound('DEPENDENCY');
      const { initiative } = await loadForWrite(
        tx,
        caller,
        dependency.fromInitiativeId,
      );

      const blockedSince =
        input.status === undefined
          ? undefined
          : input.status === 'BLOCKED'
            ? (dependency.blockedSince ?? this.clock.now())
            : null;
      await tx.dependency.update({
        where: { id: dependencyId },
        data: {
          ...input,
          neededBy: toDate(input.neededBy),
          ...(blockedSince !== undefined ? { blockedSince } : {}),
        },
      });
      await recordAudit(tx, {
        action: 'DEPENDENCY_UPDATED',
        entityType: 'Initiative',
        entityId: initiative.id,
        before: { status: dependency.status },
        after: input,
      });
      await this.recalculation.recalculateIn(tx, [initiative.id]);
      return initiative.id;
    });
    return this.initiatives.detail(caller, initiativeId);
  }

  async removeDependency(
    caller: AuthContext,
    dependencyId: string,
  ): Promise<InitiativeDetail> {
    const initiativeId = await this.db.transaction(async (tx) => {
      const dependency = await tx.dependency.findUnique({
        where: { id: dependencyId },
        include: { toInitiative: { select: { code: true } } },
      });
      if (!dependency) throw notFound('DEPENDENCY');
      const { initiative } = await loadForWrite(
        tx,
        caller,
        dependency.fromInitiativeId,
      );
      const linkedEscalations = await tx.escalation.count({
        where: { dependencyId, status: 'OPEN' },
      });
      if (linkedEscalations > 0) {
        throw new ConflictException({
          code: 'DEPENDENCY_ESCALATED',
          message: 'This dependency has an open escalation. Resolve it first.',
        });
      }
      await tx.dependency.delete({ where: { id: dependencyId } });
      await recordAudit(tx, {
        action: 'DEPENDENCY_REMOVED',
        entityType: 'Initiative',
        entityId: initiative.id,
        before: { waitsOn: dependency.toInitiative.code },
      });
      await this.recalculation.recalculateIn(tx, [initiative.id]);
      return initiative.id;
    });
    return this.initiatives.detail(caller, initiativeId);
  }

  private async assertNoCycle(
    tx: TenantTransactionClient,
    planId: string,
    fromId: string,
    toId: string,
  ) {
    const edges = await tx.dependency.findMany({
      where: { fromInitiative: { planId }, status: { not: 'RESOLVED' } },
      select: { fromInitiativeId: true, toInitiativeId: true },
    });
    const cycle = findDependencyCycle(
      edges.map((e) => ({
        fromId: e.fromInitiativeId,
        toId: e.toInitiativeId,
      })),
      fromId,
      toId,
    );
    if (!cycle) return;
    const codes = await tx.initiative.findMany({
      where: { id: { in: cycle } },
      select: { id: true, code: true },
    });
    const codeOf = new Map(codes.map((c) => [c.id, c.code]));
    throw new ConflictException({
      code: 'DEPENDENCY_CYCLE',
      message: `This would create a loop that can never resolve: ${cycle.map((id) => codeOf.get(id)).join(' → ')}.`,
    });
  }
}
