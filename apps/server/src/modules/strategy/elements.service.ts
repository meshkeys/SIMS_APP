import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { toIsoDate, toNumber } from '../../common/data/numbers.js';
import { isUniqueViolation } from '../../common/data/prisma-errors.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { canSeeInitiative } from '../../domain/access/initiative-visibility.js';
import { nextElementCode } from '../../domain/strategy/element-codes.js';
import { progressToTarget } from '../../domain/strategy/kpi-progress.js';
import type {
  Health,
  InitiativeStatus,
  KpiDirection,
  Trajectory,
} from '../../generated/prisma/enums.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
} from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import {
  assertActiveMembers,
  personSelect,
  type PersonRef,
  toPersonRef,
} from '../people/person.js';
import { PlansService } from './plans.service.js';
import type {
  CreateElementInput,
  UpdateElementInput,
} from './strategy.schemas.js';

export interface ElementKpi {
  id: string;
  code: string;
  name: string;
  unit: string;
  direction: KpiDirection;
  baseline: number | null;
  /** The next target due (e.g. FY2026), else the end-of-plan target. */
  currentTarget: { label: string; value: number; targetDate: string } | null;
  planTarget: number | null;
  latestValue: number | null;
  latestAt: string | null;
  trajectory: Trajectory;
  /** % of the way from baseline to the current target. */
  progressToTarget: number | null;
}

export interface ElementContributor {
  initiativeId: string;
  code: string;
  title: string;
  status: InitiativeStatus;
  health: Health;
  verifiedProgress: number;
  contributionWeight: number;
  /** This element is the initiative's home objective. */
  isPrimary: boolean;
}

export interface ElementDetail {
  id: string;
  planId: string;
  code: string;
  title: string;
  description: string | null;
  depth: number;
  level: { id: string; label: string };
  /** Ancestors from the top, e.g. [P1 Revenue Diversification]. */
  breadcrumb: { id: string; code: string; title: string; levelLabel: string }[];
  owner: PersonRef | null;
  sponsor: PersonRef | null;
  executionScore: number | null;
  impactScore: number | null;
  health: Health;
  kpis: ElementKpi[];
  contributors: ElementContributor[];
  /** Sensitive initiatives the caller may not see, counted but not listed. */
  hiddenContributors: number;
  children: { id: string; code: string; title: string }[];
}

/** Initiatives in these states are not (or no longer) delivering, so they are not listed. */
const NOT_CONTRIBUTING: InitiativeStatus[] = ['DRAFT', 'PROPOSED', 'CANCELLED'];

const elementNotFound = () =>
  new NotFoundException({
    code: 'ELEMENT_NOT_FOUND',
    message: 'Strategy item not found.',
  });

const invalid = (path: string, message: string) =>
  new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Some fields are missing or invalid.',
    errors: [{ path, message, code: 'custom' }],
  });

const codeTaken = (code: string) =>
  new ConflictException({
    code: 'CODE_TAKEN',
    message: `Another item in this plan already uses the code ${code}.`,
  });

@Injectable()
export class ElementsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly plans: PlansService,
  ) {}

  async detail(viewer: AuthContext, elementId: string): Promise<ElementDetail> {
    const db = this.db.client;
    const element = await db.strategyElement.findUnique({
      where: { id: elementId },
      include: {
        level: { select: { id: true, label: true, depth: true } },
        owner: personSelect,
        sponsor: personSelect,
        children: {
          orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
          select: { id: true, code: true, title: true },
        },
        kpis: {
          orderBy: { code: 'asc' },
          include: { targets: { orderBy: { targetDate: 'asc' } } },
        },
        initiativeLinks: {
          where: { initiative: { status: { notIn: NOT_CONTRIBUTING } } },
          orderBy: [{ contributionWeight: 'desc' }],
          include: {
            initiative: {
              select: {
                id: true,
                code: true,
                title: true,
                status: true,
                isSensitive: true,
                ownerId: true,
                sponsorId: true,
                benefitsOwnerId: true,
                calculatedHealth: true,
                healthOverride: true,
                verifiedProgress: true,
              },
            },
          },
        },
      },
    });
    if (!element) throw elementNotFound();

    const today = new Date();
    const visible = element.initiativeLinks.filter((link) =>
      canSeeInitiative(viewer, link.initiative),
    );

    return {
      id: element.id,
      planId: element.planId,
      code: element.code,
      title: element.title,
      description: element.description,
      depth: element.level.depth,
      level: { id: element.level.id, label: element.level.label },
      breadcrumb: await this.ancestors(element.parentId),
      owner: toPersonRef(element.owner),
      sponsor: toPersonRef(element.sponsor),
      executionScore: toNumber(element.executionScore),
      impactScore: toNumber(element.impactScore),
      health: element.health,
      kpis: element.kpis.map((kpi) => {
        const next =
          kpi.targets.find((target) => target.targetDate >= today) ??
          kpi.targets.at(-1);
        const currentTarget = next
          ? {
              label: next.label,
              value: toNumber(next.value),
              targetDate: toIsoDate(next.targetDate),
            }
          : null;
        const baseline = toNumber(kpi.baseline);
        const latestValue = toNumber(kpi.latestValue);
        return {
          id: kpi.id,
          code: kpi.code,
          name: kpi.name,
          unit: kpi.unit,
          direction: kpi.direction,
          baseline,
          currentTarget,
          planTarget: toNumber(kpi.target),
          latestValue,
          latestAt: toIsoDate(kpi.latestAt),
          trajectory: kpi.trajectory,
          progressToTarget: progressToTarget({
            direction: kpi.direction,
            baseline,
            target: currentTarget?.value ?? toNumber(kpi.target),
            actual: latestValue,
            rangeLow: toNumber(kpi.rangeLow),
            rangeHigh: toNumber(kpi.rangeHigh),
          }),
        };
      }),
      contributors: visible.map((link) => ({
        initiativeId: link.initiative.id,
        code: link.initiative.code,
        title: link.initiative.title,
        status: link.initiative.status,
        health:
          link.initiative.healthOverride ?? link.initiative.calculatedHealth,
        verifiedProgress: toNumber(link.initiative.verifiedProgress),
        contributionWeight: toNumber(link.contributionWeight),
        isPrimary: link.isPrimary,
      })),
      hiddenContributors: element.initiativeLinks.length - visible.length,
      children: element.children,
    };
  }

  async create(
    viewer: AuthContext,
    planId: string,
    input: CreateElementInput,
  ): Promise<ElementDetail> {
    const elementId = uuidv7();
    try {
      await this.db.transaction(async (tx) => {
        await this.plans.assertPlanExists(planId, tx);
        const parent = input.parentId
          ? await tx.strategyElement.findUnique({
              where: { id: input.parentId },
              select: {
                id: true,
                planId: true,
                code: true,
                title: true,
                level: { select: { depth: true } },
              },
            })
          : null;
        if (input.parentId && (!parent || parent.planId !== planId)) {
          throw invalid('parentId', 'Choose a parent from the same plan');
        }

        const depth = parent ? parent.level.depth + 1 : 1;
        const level = await tx.frameworkLevel.findUnique({
          where: { planId_depth: { planId, depth } },
        });
        if (!level) {
          throw invalid(
            'parentId',
            parent
              ? `There is no level below ${parent.code} ${parent.title}. Add one to the framework first.`
              : 'This plan has no levels yet.',
          );
        }
        await assertActiveMembers(tx, {
          ownerId: input.ownerId,
          sponsorId: input.sponsorId,
        });

        const siblings = await tx.strategyElement.findMany({
          where: { planId, levelId: level.id, parentId: parent?.id ?? null },
          select: { code: true, sortOrder: true },
        });
        const code =
          input.code ??
          nextElementCode({
            prefix: level.codePrefix ?? level.label.charAt(0).toUpperCase(),
            parentCode: parent?.code,
            siblingCodes: siblings.map((sibling) => sibling.code),
          });

        await tx.strategyElement.create({
          data: {
            id: elementId,
            organisationId: TenantContext.require().organisationId,
            planId,
            levelId: level.id,
            parentId: parent?.id ?? null,
            code,
            title: input.title,
            description: input.description ?? null,
            ownerId: input.ownerId ?? null,
            sponsorId: input.sponsorId ?? null,
            sortOrder: siblings.reduce(
              (max, sibling) => Math.max(max, sibling.sortOrder + 1),
              0,
            ),
          },
        });
        await recordAudit(tx, {
          action: 'ELEMENT_CREATED',
          entityType: 'StrategyElement',
          entityId: elementId,
          after: {
            code,
            title: input.title,
            level: level.label,
            parentId: parent?.id ?? null,
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error, 'code')) throw codeTaken(input.code ?? '');
      throw error;
    }
    return this.detail(viewer, elementId);
  }

  async update(
    viewer: AuthContext,
    elementId: string,
    input: UpdateElementInput,
  ): Promise<ElementDetail> {
    try {
      await this.db.transaction(async (tx) => {
        const current = await tx.strategyElement.findUnique({
          where: { id: elementId },
          select: {
            id: true,
            planId: true,
            parentId: true,
            code: true,
            title: true,
            description: true,
            ownerId: true,
            sponsorId: true,
            sortOrder: true,
            level: { select: { depth: true } },
          },
        });
        if (!current) throw elementNotFound();

        if (input.parentId !== undefined) {
          if (current.level.depth === 1)
            throw invalid('parentId', 'Top-level items have no parent');
          const parent = await tx.strategyElement.findUnique({
            where: { id: input.parentId },
            select: { planId: true, level: { select: { depth: true } } },
          });
          if (
            !parent ||
            parent.planId !== current.planId ||
            parent.level.depth !== current.level.depth - 1
          ) {
            throw invalid(
              'parentId',
              'Choose a parent one level up in the same plan',
            );
          }
        }
        await assertActiveMembers(tx, {
          ownerId: input.ownerId,
          sponsorId: input.sponsorId,
        });

        await tx.strategyElement.update({
          where: { id: elementId },
          data: input,
        });
        const { level: _level, id: _id, planId: _planId, ...before } = current;
        await recordAudit(tx, {
          action: 'ELEMENT_UPDATED',
          entityType: 'StrategyElement',
          entityId: elementId,
          before: Object.fromEntries(
            Object.keys(input).map((key) => [
              key,
              before[key as keyof typeof before],
            ]),
          ),
          after: input,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error, 'code')) throw codeTaken(input.code ?? '');
      throw error;
    }
    return this.detail(viewer, elementId);
  }

  /**
   * Deletes an element that holds nothing. Elements with children, KPIs or
   * linked initiatives are refused rather than silently cascading strategy data.
   */
  async remove(elementId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const element = await tx.strategyElement.findUnique({
        where: { id: elementId },
        select: {
          code: true,
          title: true,
          _count: {
            select: { children: true, kpis: true, initiativeLinks: true },
          },
        },
      });
      if (!element) throw elementNotFound();
      const { children, kpis, initiativeLinks } = element._count;
      if (children + kpis + initiativeLinks > 0) {
        throw new ConflictException({
          code: 'ELEMENT_IN_USE',
          message: `${element.code} still has ${children} sub-item(s), ${kpis} KPI(s) and ${initiativeLinks} linked initiative(s). Move or remove them first.`,
        });
      }
      await tx.strategyElement.delete({ where: { id: elementId } });
      await recordAudit(tx, {
        action: 'ELEMENT_DELETED',
        entityType: 'StrategyElement',
        entityId: elementId,
        before: { code: element.code, title: element.title },
      });
    });
  }

  private async ancestors(
    parentId: string | null,
  ): Promise<ElementDetail['breadcrumb']> {
    const chain: ElementDetail['breadcrumb'] = [];
    // Depth is capped (≤ 10 levels), so this loop is short.
    for (let id = parentId; id;) {
      const node: {
        id: string;
        code: string;
        title: string;
        parentId: string | null;
        level: { label: string };
      } | null = await this.db.client.strategyElement.findUnique({
        where: { id },
        select: {
          id: true,
          code: true,
          title: true,
          parentId: true,
          level: { select: { label: true } },
        },
      });
      if (!node) break;
      chain.unshift({
        id: node.id,
        code: node.code,
        title: node.title,
        levelLabel: node.level.label,
      });
      id = node.parentId;
    }
    return chain;
  }
}
