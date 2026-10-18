import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { toIsoDate, toNumber } from '../../common/data/numbers.js';
import { isUniqueViolation } from '../../common/data/prisma-errors.js';
import type { FieldError } from '../../common/http/problem-details.filter.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { canSeeInitiative } from '../../domain/access/initiative-visibility.js';
import {
  nextKpiCode,
  validateKpiDefinition,
} from '../../domain/kpis/kpi-definition.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import {
  assertActiveMembers,
  personSelect,
  toPersonRef,
} from '../people/person.js';
import { PlansService } from '../strategy/plans.service.js';
import { kpiTargetsInclude, toKpiSummary } from './kpi-view.js';
import type {
  CreateKpiInput,
  ElementRef,
  KpiDetail,
  KpiListItem,
  KpiTargetInput,
  KpiTargetsInput,
  UpdateKpiInput,
} from '@sims/contracts';

const kpiNotFound = () =>
  new NotFoundException({ code: 'KPI_NOT_FOUND', message: 'KPI not found.' });

const validationFailed = (errors: FieldError[]) =>
  new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Some fields are missing or invalid.',
    errors,
  });

const codeTaken = (code: string) =>
  new ConflictException({
    code: 'CODE_TAKEN',
    message: `Another KPI already uses the code ${code}.`,
  });

@Injectable()
export class KpisService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly plans: PlansService,
  ) {}

  /** A plan's KPIs (optionally one element's), with their top-level element for grouping. */
  async listForPlan(
    planId: string,
    elementId?: string,
  ): Promise<KpiListItem[]> {
    await this.plans.assertPlanExists(planId);
    const db = this.db.client;
    const [elements, kpis] = await Promise.all([
      db.strategyElement.findMany({
        where: { planId },
        select: { id: true, code: true, title: true, parentId: true },
      }),
      db.kpi.findMany({
        where: { element: { planId }, ...(elementId ? { elementId } : {}) },
        orderBy: { code: 'asc' },
        include: {
          ...kpiTargetsInclude,
          owner: personSelect,
          element: { select: { id: true, code: true, title: true } },
        },
      }),
    ]);

    const byId = new Map(elements.map((element) => [element.id, element]));
    const topLevelOf = (id: string): ElementRef => {
      let node = byId.get(id)!;
      while (node.parentId && byId.has(node.parentId))
        node = byId.get(node.parentId)!;
      return { id: node.id, code: node.code, title: node.title };
    };
    const today = new Date();
    return kpis.map((kpi) => ({
      ...toKpiSummary(kpi, today),
      element: kpi.element,
      topLevel: topLevelOf(kpi.element.id),
      owner: toPersonRef(kpi.owner),
    }));
  }

  async detail(viewer: AuthContext, kpiId: string): Promise<KpiDetail> {
    const kpi = await this.db.client.kpi.findUnique({
      where: { id: kpiId },
      include: {
        ...kpiTargetsInclude,
        owner: personSelect,
        element: {
          select: { id: true, code: true, title: true, planId: true },
        },
        actuals: {
          orderBy: { period: { startDate: 'desc' } },
          take: 12,
          include: { period: { select: { name: true, endDate: true } } },
        },
        initiativeLinks: {
          include: {
            initiative: {
              select: {
                id: true,
                code: true,
                title: true,
                isSensitive: true,
                ownerId: true,
                sponsorId: true,
                benefitsOwnerId: true,
                calculatedHealth: true,
                healthOverride: true,
              },
            },
          },
        },
      },
    });
    if (!kpi) throw kpiNotFound();

    const visible = kpi.initiativeLinks.filter((link) =>
      canSeeInitiative(viewer, link.initiative),
    );
    const { planId, ...element } = kpi.element;
    return {
      ...toKpiSummary(kpi),
      planId,
      element,
      owner: toPersonRef(kpi.owner),
      actuals: [...kpi.actuals].reverse().map((actual) => ({
        period: actual.period.name,
        periodEnd: toIsoDate(actual.period.endDate),
        value: toNumber(actual.value),
        verified: actual.verifiedAt !== null,
        commentary: actual.commentary,
      })),
      linkedInitiatives: visible
        .map((link) => ({
          initiativeId: link.initiative.id,
          code: link.initiative.code,
          title: link.initiative.title,
          health:
            link.initiative.healthOverride ?? link.initiative.calculatedHealth,
          expectedImpact: toNumber(link.expectedImpact),
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      hiddenLinkedInitiatives: kpi.initiativeLinks.length - visible.length,
    };
  }

  async create(
    viewer: AuthContext,
    elementId: string,
    input: CreateKpiInput,
  ): Promise<KpiDetail> {
    const kpiId = uuidv7();
    try {
      await this.db.transaction(async (tx) => {
        const element = await this.elementForKpis(tx, elementId, 'subject');
        const problems = [
          ...validateKpiDefinition(input),
          ...this.validateTargets(input.targets, element.plan),
        ];
        if (problems.length)
          throw validationFailed(
            problems.map((p) => ({ ...p, code: 'custom' })),
          );
        await assertActiveMembers(tx, { ownerId: input.ownerId });

        const code =
          input.code ??
          nextKpiCode(
            (await tx.kpi.findMany({ select: { code: true } })).map(
              (k) => k.code,
            ),
          );
        const { organisationId } = TenantContext.require();
        await tx.kpi.create({
          data: {
            id: kpiId,
            organisationId,
            elementId,
            code,
            name: input.name,
            unit: input.unit,
            direction: input.direction,
            frequency: input.frequency,
            baseline: input.baseline,
            baselineDate: input.baselineDate
              ? new Date(input.baselineDate)
              : null,
            target: input.target,
            rangeLow: input.rangeLow,
            rangeHigh: input.rangeHigh,
            ownerId: input.ownerId,
            // Nothing recorded yet; set when actuals arrive.
            trajectory: 'NOT_MEASURABLE',
          },
        });
        await this.writeTargets(tx, kpiId, input.targets);
        await recordAudit(tx, {
          action: 'KPI_CREATED',
          entityType: 'Kpi',
          entityId: kpiId,
          after: { code, name: input.name, elementId, targets: input.targets },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error, 'code')) throw codeTaken(input.code ?? '');
      throw error;
    }
    return this.detail(viewer, kpiId);
  }

  async update(
    viewer: AuthContext,
    kpiId: string,
    input: UpdateKpiInput,
  ): Promise<KpiDetail> {
    try {
      await this.db.transaction(async (tx) => {
        const current = await tx.kpi.findUnique({
          where: { id: kpiId },
          include: { element: { select: { planId: true } } },
        });
        if (!current) throw kpiNotFound();

        const changes: UpdateKpiInput = { ...input };
        // Leaving "within range" clears the range unless new bounds are given.
        if (changes.direction && changes.direction !== 'WITHIN_RANGE') {
          changes.rangeLow ??= null;
          changes.rangeHigh ??= null;
        }
        const merged = {
          direction: changes.direction ?? current.direction,
          baseline:
            changes.baseline !== undefined
              ? changes.baseline
              : toNumber(current.baseline),
          target:
            changes.target !== undefined
              ? changes.target
              : toNumber(current.target),
          rangeLow:
            changes.rangeLow !== undefined
              ? changes.rangeLow
              : toNumber(current.rangeLow),
          rangeHigh:
            changes.rangeHigh !== undefined
              ? changes.rangeHigh
              : toNumber(current.rangeHigh),
        };
        const problems = validateKpiDefinition(merged);
        if (problems.length)
          throw validationFailed(
            problems.map((p) => ({ ...p, code: 'custom' })),
          );

        if (changes.elementId && changes.elementId !== current.elementId) {
          const destination = await this.elementForKpis(
            tx,
            changes.elementId,
            'destination',
          );
          if (destination.planId !== current.element.planId) {
            throw validationFailed([
              {
                path: 'elementId',
                message: 'Choose an element in the same plan',
                code: 'custom',
              },
            ]);
          }
        }
        await assertActiveMembers(tx, { ownerId: changes.ownerId });

        const { baselineDate, ...rest } = changes;
        await tx.kpi.update({
          where: { id: kpiId },
          data: {
            ...rest,
            ...(baselineDate !== undefined
              ? { baselineDate: baselineDate ? new Date(baselineDate) : null }
              : {}),
          },
        });
        await recordAudit(tx, {
          action: 'KPI_UPDATED',
          entityType: 'Kpi',
          entityId: kpiId,
          before: Object.fromEntries(
            Object.keys(changes).map((key) => [
              key,
              current[key as keyof typeof current],
            ]),
          ),
          after: changes,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error, 'code')) throw codeTaken(input.code ?? '');
      throw error;
    }
    return this.detail(viewer, kpiId);
  }

  /** Replaces all interim targets at once (the targets editor saves the whole list). */
  async replaceTargets(
    viewer: AuthContext,
    kpiId: string,
    input: KpiTargetsInput,
  ): Promise<KpiDetail> {
    await this.db.transaction(async (tx) => {
      const kpi = await tx.kpi.findUnique({
        where: { id: kpiId },
        include: {
          ...kpiTargetsInclude,
          element: {
            select: { plan: { select: { startDate: true, endDate: true } } },
          },
        },
      });
      if (!kpi) throw kpiNotFound();
      const problems = this.validateTargets(input.targets, kpi.element.plan);
      if (problems.length)
        throw validationFailed(problems.map((p) => ({ ...p, code: 'custom' })));

      await tx.kpiTarget.deleteMany({ where: { kpiId } });
      await this.writeTargets(tx, kpiId, input.targets);
      await recordAudit(tx, {
        action: 'KPI_TARGETS_CHANGED',
        entityType: 'Kpi',
        entityId: kpiId,
        before: kpi.targets.map((t) => ({
          label: t.label,
          targetDate: toIsoDate(t.targetDate),
          value: toNumber(t.value),
        })),
        after: input.targets,
      });
    });
    return this.detail(viewer, kpiId);
  }

  /**
   * Deletes a KPI that has no history. Recorded actuals feed past reports
   * and Board packs, so a KPI with actuals (or linked initiatives) is kept.
   */
  async remove(kpiId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const kpi = await tx.kpi.findUnique({
        where: { id: kpiId },
        select: {
          code: true,
          name: true,
          _count: { select: { actuals: true, initiativeLinks: true } },
        },
      });
      if (!kpi) throw kpiNotFound();
      if (kpi._count.actuals > 0) {
        throw new ConflictException({
          code: 'KPI_HAS_ACTUALS',
          message: `${kpi.code} has ${kpi._count.actuals} recorded actual(s) used in past reports, so it cannot be deleted.`,
        });
      }
      if (kpi._count.initiativeLinks > 0) {
        throw new ConflictException({
          code: 'KPI_IN_USE',
          message: `${kpi.code} is linked to ${kpi._count.initiativeLinks} initiative(s). Unlink them first.`,
        });
      }
      await tx.kpi.delete({ where: { id: kpiId } });
      await recordAudit(tx, {
        action: 'KPI_DELETED',
        entityType: 'Kpi',
        entityId: kpiId,
        before: { code: kpi.code, name: kpi.name },
      });
    });
  }

  // ---------------------------------------------------------------------------

  /**
   * The element, checked to exist and to sit on a level that holds KPIs.
   * A missing element is a 404 when it is the URL's subject, and a field
   * error when it is a destination given in the body.
   */
  private async elementForKpis(
    tx: TenantTransactionClient,
    elementId: string,
    role: 'subject' | 'destination',
  ) {
    const element = await tx.strategyElement.findUnique({
      where: { id: elementId },
      select: {
        id: true,
        code: true,
        planId: true,
        level: { select: { label: true, pluralLabel: true, allowsKpis: true } },
        plan: { select: { startDate: true, endDate: true } },
      },
    });
    if (!element) {
      throw role === 'subject'
        ? new NotFoundException({
            code: 'ELEMENT_NOT_FOUND',
            message: 'Strategy item not found.',
          })
        : validationFailed([
            {
              path: 'elementId',
              message: 'Choose an existing element',
              code: 'not_found',
            },
          ]);
    }
    if (!element.level.allowsKpis) {
      throw new ConflictException({
        code: 'KPIS_NOT_ALLOWED',
        message: `${element.level.pluralLabel} do not hold KPIs in this framework. Add the KPI to a level below, or allow KPIs on this level.`,
      });
    }
    return element;
  }

  /** Targets must fall inside the plan period, with distinct dates and labels. */
  private validateTargets(
    targets: readonly KpiTargetInput[],
    plan: { startDate: Date; endDate: Date },
  ): { path: string; message: string }[] {
    const problems: { path: string; message: string }[] = [];
    const start = toIsoDate(plan.startDate);
    const end = toIsoDate(plan.endDate);
    const dates = new Set<string>();
    const labels = new Set<string>();
    targets.forEach((target, index) => {
      if (target.targetDate < start || target.targetDate > end) {
        problems.push({
          path: `targets.${index}.targetDate`,
          message: `Choose a date within the plan (${start} to ${end})`,
        });
      }
      if (dates.has(target.targetDate)) {
        problems.push({
          path: `targets.${index}.targetDate`,
          message: 'Each target needs a different date',
        });
      }
      const label = target.label.toLowerCase();
      if (labels.has(label)) {
        problems.push({
          path: `targets.${index}.label`,
          message: 'Each target needs a different label',
        });
      }
      dates.add(target.targetDate);
      labels.add(label);
    });
    return problems;
  }

  private async writeTargets(
    tx: TenantTransactionClient,
    kpiId: string,
    targets: readonly KpiTargetInput[],
  ) {
    if (targets.length === 0) return;
    const { organisationId } = TenantContext.require();
    await tx.kpiTarget.createMany({
      data: targets.map((target) => ({
        id: uuidv7(),
        organisationId,
        kpiId,
        label: target.label,
        targetDate: new Date(target.targetDate),
        value: target.value,
      })),
    });
  }
}
