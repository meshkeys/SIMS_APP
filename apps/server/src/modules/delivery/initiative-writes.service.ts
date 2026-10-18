import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { toIsoDate } from '../../common/data/numbers.js';
import { isUniqueViolation } from '../../common/data/prisma-errors.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import {
  activationGaps,
  allowedTransitions,
  canTransition,
  transitionNeedsReason,
} from '../../domain/delivery/lifecycle.js';
import {
  deniedFields,
  suggestInitiativeCode,
} from '../../domain/delivery/permissions.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import { assertActiveMembers } from '../people/person.js';
import { PlansService } from '../strategy/plans.service.js';
import type {
  CreateInitiativeInput,
  ObjectivesInput,
  StatusChangeInput,
  UpdateInitiativeInput,
} from './delivery.schemas.js';
import { HealthRecalculationService } from './health-recalculation.service.js';
import {
  type InitiativeDetail,
  InitiativesService,
} from './initiatives.service.js';
import {
  assertDepartmentExists,
  baselineLocked,
  invalidField,
  loadForWrite,
  toDate,
} from './write-access.js';

const BASELINE_FIELDS = ['baselineStart', 'baselineEnd', 'baselineBudget'];

@Injectable()
export class InitiativeWritesService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly plans: PlansService,
    private readonly initiatives: InitiativesService,
    private readonly recalculation: HealthRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Proposes (or, for the Strategy Office, drafts) an initiative. A proposer
   * who is not in the Strategy Office becomes its owner unless one is named.
   */
  async create(
    caller: AuthContext,
    input: CreateInitiativeInput,
  ): Promise<InitiativeDetail> {
    const planId = input.planId ?? (await this.plans.currentPlanId());
    const id = uuidv7();
    const isOffice =
      caller.roles.includes('STRATEGY_OFFICE') ||
      caller.roles.includes('SYSTEM_ADMIN');
    const ownerId = input.ownerId ?? (isOffice ? null : caller.membershipId);

    try {
      await this.db.transaction(async (tx) => {
        await this.plans.assertPlanExists(planId, tx);
        await this.assertObjectives(tx, planId, input.objectives);
        await assertActiveMembers(tx, {
          ownerId,
          sponsorId: input.sponsorId,
          benefitsOwnerId: input.benefitsOwnerId,
        });
        await assertDepartmentExists(tx, input.departmentId);

        const code =
          input.code ?? (await this.suggestCode(tx, input.objectives));
        const { organisationId } = TenantContext.require();
        await tx.initiative.create({
          data: {
            id,
            organisationId,
            planId,
            code,
            title: input.title,
            description: input.description ?? null,
            businessCase: input.businessCase ?? null,
            scope: input.scope ?? null,
            ownerId,
            sponsorId: input.sponsorId,
            benefitsOwnerId: input.benefitsOwnerId,
            departmentId: input.departmentId,
            priority: input.priority,
            isSensitive: input.isSensitive,
            status: input.status,
            baselineStart: toDate(input.baselineStart),
            baselineEnd: toDate(input.baselineEnd),
            baselineBudget: input.baselineBudget,
          },
        });
        await tx.initiativeObjectiveLink.createMany({
          data: input.objectives.map((link) => ({
            organisationId,
            initiativeId: id,
            elementId: link.elementId,
            contributionWeight: link.weight,
            isPrimary: link.isPrimary,
          })),
        });
        await recordAudit(tx, {
          action:
            input.status === 'PROPOSED'
              ? 'INITIATIVE_PROPOSED'
              : 'INITIATIVE_DRAFTED',
          entityType: 'Initiative',
          entityId: id,
          after: { code, title: input.title, objectives: input.objectives },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error, 'code')) {
        throw new ConflictException({
          code: 'CODE_TAKEN',
          message: `Another initiative already uses the code ${input.code}.`,
        });
      }
      throw error;
    }
    return this.initiatives.detail(caller, id);
  }

  async update(
    caller: AuthContext,
    id: string,
    input: UpdateInitiativeInput,
  ): Promise<InitiativeDetail> {
    await this.db.transaction(async (tx) => {
      const { initiative, relation } = await loadForWrite(tx, caller, id);
      const changed = Object.keys(input);
      const denied = deniedFields(relation, initiative.status, changed);
      const notPermitted = denied.filter((d) => d.reason === 'NOT_PERMITTED');
      if (notPermitted.length) {
        throw new ForbiddenException({
          code: 'FIELDS_NOT_PERMITTED',
          message: 'You cannot change some of these fields.',
          errors: notPermitted.map((d) => ({
            path: d.field,
            message: 'Not permitted for your role',
            code: 'forbidden',
          })),
        });
      }
      if (denied.length) throw baselineLocked();

      const start =
        input.baselineStart !== undefined
          ? input.baselineStart
          : toIsoDate(initiative.baselineStart);
      const end =
        input.baselineEnd !== undefined
          ? input.baselineEnd
          : toIsoDate(initiative.baselineEnd);
      if (start && end && end < start)
        throw invalidField(
          'baselineEnd',
          'The end date must be on or after the start date',
        );

      await assertActiveMembers(tx, {
        ownerId: input.ownerId,
        sponsorId: input.sponsorId,
        benefitsOwnerId: input.benefitsOwnerId,
      });
      await assertDepartmentExists(tx, input.departmentId);

      const before = await tx.initiative.findUniqueOrThrow({ where: { id } });
      await tx.initiative.update({
        where: { id },
        data: {
          ...input,
          baselineStart: toDate(input.baselineStart),
          baselineEnd: toDate(input.baselineEnd),
          forecastEnd: toDate(input.forecastEnd),
        },
      });
      const baselineChanged = changed.some((field) =>
        BASELINE_FIELDS.includes(field),
      );
      await recordAudit(tx, {
        action:
          baselineChanged && initiative.status === 'ACTIVE'
            ? 'BASELINE_CHANGED'
            : 'INITIATIVE_UPDATED',
        entityType: 'Initiative',
        entityId: id,
        before: Object.fromEntries(
          changed.map((key) => [key, (before as Record<string, unknown>)[key]]),
        ),
        after: input,
      });
      await this.recalculation.recalculateIn(tx, [id]);
    });
    return this.initiatives.detail(caller, id);
  }

  /** Replaces the objectives the initiative contributes to (Strategy Office). */
  async replaceObjectives(
    caller: AuthContext,
    id: string,
    input: ObjectivesInput,
  ): Promise<InitiativeDetail> {
    await this.db.transaction(async (tx) => {
      const { initiative, relation } = await loadForWrite(tx, caller, id);
      if (relation !== 'OFFICE')
        throw officeOnly('change which objectives an initiative delivers');
      await this.assertObjectives(tx, initiative.planId, input.objectives);

      const before = await tx.initiativeObjectiveLink.findMany({
        where: { initiativeId: id },
        select: { elementId: true, contributionWeight: true, isPrimary: true },
      });
      await tx.initiativeObjectiveLink.deleteMany({
        where: { initiativeId: id },
      });
      const { organisationId } = TenantContext.require();
      await tx.initiativeObjectiveLink.createMany({
        data: input.objectives.map((link) => ({
          organisationId,
          initiativeId: id,
          elementId: link.elementId,
          contributionWeight: link.weight,
          isPrimary: link.isPrimary,
        })),
      });
      await recordAudit(tx, {
        action: 'OBJECTIVES_CHANGED',
        entityType: 'Initiative',
        entityId: id,
        before,
        after: input.objectives,
      });
    });
    return this.initiatives.detail(caller, id);
  }

  /** Moves the initiative through its lifecycle (Strategy Office). */
  async changeStatus(
    caller: AuthContext,
    id: string,
    input: StatusChangeInput,
  ): Promise<InitiativeDetail> {
    await this.db.transaction(async (tx) => {
      const { initiative, relation } = await loadForWrite(tx, caller, id);
      if (relation !== 'OFFICE')
        throw officeOnly('change an initiative’s status');
      if (!canTransition(initiative.status, input.status)) {
        const allowed = allowedTransitions(initiative.status);
        throw new ConflictException({
          code: 'INVALID_TRANSITION',
          message: allowed.length
            ? `A ${initiative.status.toLowerCase().replace('_', ' ')} initiative can only move to: ${allowed.join(', ')}.`
            : `A ${initiative.status.toLowerCase()} initiative cannot change status.`,
        });
      }
      if (transitionNeedsReason(input.status) && !input.reason) {
        throw invalidField('reason', 'Explain why');
      }
      if (input.status === 'ACTIVE') await this.assertReady(tx, initiative);

      const now = this.clock.now();
      await tx.initiative.update({
        where: { id },
        data: {
          status: input.status,
          // First activation starts the reporting obligation.
          ...(input.status === 'ACTIVE'
            ? { activatedAt: initiative.activatedAt ?? now }
            : {}),
          ...(input.status === 'CLOSED'
            ? { actualEnd: new Date(`${toIsoDate(now)}T00:00:00Z`) }
            : {}),
        },
      });
      await recordAudit(tx, {
        action: 'STATUS_CHANGED',
        entityType: 'Initiative',
        entityId: id,
        before: { status: initiative.status },
        after: { status: input.status, reason: input.reason ?? null },
      });
      if (input.status === 'ACTIVE')
        await this.recalculation.recalculateIn(tx, [id]);
      // Joining or leaving delivery changes what pillars and objectives roll up.
      await this.recalculation.recalculateRollups(tx, [initiative.planId]);
    });
    return this.initiatives.detail(caller, id);
  }

  // ---------------------------------------------------------------------------

  private async assertReady(
    tx: TenantTransactionClient,
    initiative: {
      id: string;
      ownerId: string | null;
      sponsorId: string | null;
      baselineStart: Date | null;
      baselineEnd: Date | null;
    },
  ) {
    const primary = await tx.initiativeObjectiveLink.count({
      where: { initiativeId: initiative.id, isPrimary: true },
    });
    const weighted = await tx.milestone.count({
      where: { initiativeId: initiative.id, weight: { gt: 0 } },
    });
    const gaps = activationGaps({
      ownerId: initiative.ownerId,
      sponsorId: initiative.sponsorId,
      baselineStart: initiative.baselineStart,
      baselineEnd: initiative.baselineEnd,
      hasPrimaryObjective: primary > 0,
      weightedMilestones: weighted,
    });
    if (gaps.length) {
      throw new ConflictException({
        code: 'NOT_READY',
        message: 'This initiative is not ready to start delivery.',
        errors: gaps.map((message) => ({
          path: 'status',
          message,
          code: 'not_ready',
        })),
      });
    }
  }

  private async assertObjectives(
    tx: TenantTransactionClient,
    planId: string,
    objectives: CreateInitiativeInput['objectives'],
  ) {
    const found = await tx.strategyElement.findMany({
      where: { id: { in: objectives.map((o) => o.elementId) }, planId },
      select: { id: true },
    });
    const known = new Set(found.map((e) => e.id));
    const errors = objectives
      .map((o, index) => ({ o, index }))
      .filter(({ o }) => !known.has(o.elementId))
      .map(({ index }) => ({
        path: `objectives.${index}.elementId`,
        message: 'Choose an element of this plan',
        code: 'not_found',
      }));
    if (errors.length) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Some fields are missing or invalid.',
        errors,
      });
    }
  }

  /** e.g. DIG-016, from the primary objective's top-level element. */
  private async suggestCode(
    tx: TenantTransactionClient,
    objectives: CreateInitiativeInput['objectives'],
  ) {
    let node = await tx.strategyElement.findUnique({
      where: { id: objectives.find((o) => o.isPrimary)!.elementId },
      select: { title: true, parentId: true },
    });
    while (node?.parentId) {
      node = await tx.strategyElement.findUnique({
        where: { id: node.parentId },
        select: { title: true, parentId: true },
      });
    }
    const codes = await tx.initiative.findMany({ select: { code: true } });
    return suggestInitiativeCode(
      node?.title ?? null,
      codes.map((c) => c.code),
    );
  }
}

function officeOnly(action: string) {
  return new ForbiddenException({
    code: 'STRATEGY_OFFICE_ONLY',
    message: `Only the Strategy Office can ${action}.`,
  });
}
