import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { toIsoDate } from '../../common/data/numbers.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { nextElementCode } from '../../domain/strategy/element-codes.js';
import {
  FRAMEWORK_TEMPLATES,
  planLevelChanges,
} from '../../domain/strategy/framework.js';
import type {
  FrameworkTemplate,
  PlanStatus,
} from '../../generated/prisma/enums.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import type {
  CreatePlanInput,
  LevelsInput,
  LevelView,
  PlanSummary,
  UpdatePlanInput,
} from '@sims/contracts';

const planSelect = {
  id: true,
  name: true,
  status: true,
  version: true,
  template: true,
  startDate: true,
  endDate: true,
  approvedAt: true,
} as const;

type PlanRow = {
  id: string;
  name: string;
  status: PlanStatus;
  version: number;
  template: FrameworkTemplate;
  startDate: Date;
  endDate: Date;
  approvedAt: Date | null;
};

const levelSelect = {
  id: true,
  depth: true,
  label: true,
  pluralLabel: true,
  codePrefix: true,
  allowsKpis: true,
} as const;

/**
 * The plan screens open by default: an approved plan covering today, else
 * the most recent approved plan, else the most recent draft.
 */
export function pickCurrentPlan(
  plans: readonly PlanRow[],
  today = new Date(),
): string | null {
  const byStartDesc = [...plans].sort(
    (a, b) => b.startDate.getTime() - a.startDate.getTime(),
  );
  const approved = byStartDesc.filter((p) => p.status === 'APPROVED');
  return (
    approved.find((p) => p.startDate <= today && p.endDate >= today)?.id ??
    approved[0]?.id ??
    byStartDesc.find(
      (p) => p.status === 'DRAFT' || p.status === 'PENDING_APPROVAL',
    )?.id ??
    null
  );
}

const toSummary = (plan: PlanRow, currentId: string | null): PlanSummary => ({
  id: plan.id,
  name: plan.name,
  status: plan.status,
  version: plan.version,
  template: plan.template,
  startDate: toIsoDate(plan.startDate),
  endDate: toIsoDate(plan.endDate),
  approvedAt: plan.approvedAt?.toISOString() ?? null,
  isCurrent: plan.id === currentId,
});

export const planNotFound = () =>
  new NotFoundException({
    code: 'PLAN_NOT_FOUND',
    message: 'Strategic plan not found.',
  });

@Injectable()
export class PlansService {
  constructor(private readonly db: TenantPrismaService) {}

  async list(): Promise<PlanSummary[]> {
    const plans = await this.db.client.strategicPlan.findMany({
      where: { status: { not: 'ARCHIVED' } },
      orderBy: { startDate: 'desc' },
      select: planSelect,
    });
    const currentId = pickCurrentPlan(plans);
    return plans.map((plan) => toSummary(plan, currentId));
  }

  async currentPlanId(): Promise<string> {
    const plans = await this.db.client.strategicPlan.findMany({
      where: { status: { not: 'ARCHIVED' } },
      select: planSelect,
    });
    const id = pickCurrentPlan(plans);
    if (!id) {
      throw new NotFoundException({
        code: 'NO_PLAN',
        message: 'This organisation has no strategic plan yet.',
      });
    }
    return id;
  }

  /** Creates a draft plan with the template's levels (and starter elements). */
  async create(input: CreatePlanInput): Promise<PlanSummary> {
    const template = FRAMEWORK_TEMPLATES[input.template];
    const planId = uuidv7();

    await this.db.transaction(async (tx) => {
      const { organisationId } = TenantContext.require();
      await tx.strategicPlan.create({
        data: {
          id: planId,
          organisationId,
          name: input.name,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          template: input.template,
          status: 'DRAFT',
          vision: input.vision,
          mission: input.mission,
          values: input.values ?? [],
          aspiration: input.aspiration,
        },
      });
      const levelIds = template.levels.map(() => uuidv7());
      await tx.frameworkLevel.createMany({
        data: template.levels.map((level, index) => ({
          id: levelIds[index],
          organisationId,
          planId,
          depth: index + 1,
          ...level,
        })),
      });
      const codes: string[] = [];
      for (const [index, title] of template.starterElements.entries()) {
        const code = nextElementCode({
          prefix: template.levels[0].codePrefix,
          siblingCodes: codes,
        });
        codes.push(code);
        await tx.strategyElement.create({
          data: {
            id: uuidv7(),
            organisationId,
            planId,
            levelId: levelIds[0],
            code,
            title,
            sortOrder: index,
          },
        });
      }
      await recordAudit(tx, {
        action: 'PLAN_CREATED',
        entityType: 'StrategicPlan',
        entityId: planId,
        after: { name: input.name, template: input.template },
      });
    });

    return (await this.list()).find((plan) => plan.id === planId)!;
  }

  async update(planId: string, input: UpdatePlanInput): Promise<PlanSummary> {
    await this.db.transaction(async (tx) => {
      const before = await tx.strategicPlan.findUnique({
        where: { id: planId },
      });
      if (!before) throw planNotFound();
      const startDate = input.startDate
        ? new Date(input.startDate)
        : before.startDate;
      const endDate = input.endDate ? new Date(input.endDate) : before.endDate;
      if (endDate < startDate) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Some fields are missing or invalid.',
          errors: [
            {
              path: 'endDate',
              message: 'The end date must be on or after the start date',
              code: 'custom',
            },
          ],
        });
      }
      const after = await tx.strategicPlan.update({
        where: { id: planId },
        data: { ...input, startDate, endDate },
      });
      await recordAudit(tx, {
        action: 'PLAN_UPDATED',
        entityType: 'StrategicPlan',
        entityId: planId,
        before: pick(before, Object.keys(input)),
        after: pick(after, Object.keys(input)),
      });
    });
    return (await this.list()).find((plan) => plan.id === planId)!;
  }

  async levels(planId: string): Promise<LevelView[]> {
    await this.assertPlanExists(planId);
    return this.db.client.frameworkLevel.findMany({
      where: { planId },
      orderBy: { depth: 'asc' },
      select: levelSelect,
    });
  }

  /**
   * Saves the whole ordered list of levels at once (the "Name your levels"
   * screen): rename, add, remove and reorder, refusing changes that would
   * strand existing elements or KPIs.
   */
  async replaceLevels(
    planId: string,
    input: LevelsInput,
  ): Promise<LevelView[]> {
    await this.db.transaction(async (tx) => {
      const existing = await tx.frameworkLevel.findMany({
        where: { planId },
        select: {
          id: true,
          depth: true,
          label: true,
          _count: { select: { elements: true } },
          elements: { select: { _count: { select: { kpis: true } } } },
        },
      });
      if (existing.length === 0) await this.assertPlanExists(planId, tx);

      const change = planLevelChanges(
        existing.map((level) => ({
          id: level.id,
          depth: level.depth,
          label: level.label,
          elementCount: level._count.elements,
          kpiCount: level.elements.reduce(
            (sum, element) => sum + element._count.kpis,
            0,
          ),
        })),
        input.levels,
      );
      if (change.problems.length) {
        const inUse = change.problems.some(
          (problem) => problem.code === 'LEVEL_IN_USE',
        );
        const body = {
          code: inUse ? 'LEVEL_IN_USE' : 'VALIDATION_FAILED',
          message: inUse
            ? 'Some levels hold items and cannot be removed or moved.'
            : 'Some fields are missing or invalid.',
          errors: change.problems.map(({ path, code, message }) => ({
            path,
            code,
            message,
          })),
        };
        throw inUse
          ? new ConflictException(body)
          : new BadRequestException(body);
      }

      const { organisationId } = TenantContext.require();
      if (change.deleteIds.length) {
        await tx.frameworkLevel.deleteMany({
          where: { id: { in: change.deleteIds } },
        });
      }
      for (const update of change.updates) {
        await tx.frameworkLevel.update({
          where: { id: update.id },
          data: update.definition,
        });
      }
      if (change.creates.length) {
        await tx.frameworkLevel.createMany({
          data: change.creates.map((create) => ({
            id: create.id ?? uuidv7(),
            organisationId,
            planId,
            depth: create.depth,
            ...create.definition,
          })),
        });
      }
      await recordAudit(tx, {
        action: 'LEVELS_CHANGED',
        entityType: 'StrategicPlan',
        entityId: planId,
        before: existing.map(({ id, depth, label }) => ({ id, depth, label })),
        after: input.levels.map((level, index) => ({
          depth: index + 1,
          label: level.label,
        })),
      });
    });
    return this.levels(planId);
  }

  async assertPlanExists(
    planId: string,
    tx?: TenantTransactionClient,
  ): Promise<void> {
    const args = { where: { id: planId }, select: { id: true } } as const;
    const plan = tx
      ? await tx.strategicPlan.findUnique(args)
      : await this.db.client.strategicPlan.findUnique(args);
    if (!plan) throw planNotFound();
  }
}

function pick(record: object, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(
    keys.map((key) => [key, (record as Record<string, unknown>)[key]]),
  );
}
