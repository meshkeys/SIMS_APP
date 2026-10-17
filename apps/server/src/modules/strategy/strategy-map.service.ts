import { Injectable } from '@nestjs/common';
import { toIsoDate, toNumber } from '../../common/data/numbers.js';
import type { Health, PlanStatus } from '../../generated/prisma/enums.js';
import { TenantPrismaService } from '../../infrastructure/database/index.js';
import { personSelect, type PersonRef, toPersonRef } from '../people/person.js';
import { type LevelView, planNotFound } from './plans.service.js';

export type HealthCounts = Record<Health, number>;

export interface MapElement {
  id: string;
  parentId: string | null;
  levelId: string;
  depth: number;
  code: string;
  title: string;
  sortOrder: number;
  owner: PersonRef | null;
  sponsor: PersonRef | null;
  /** Rollups (0–100), null until there is something to measure. */
  executionScore: number | null;
  impactScore: number | null;
  health: Health;
  kpiCount: number;
  /** First KPI, shown on the card: "Non-interest income: 18% → 30%". */
  headlineKpi: {
    name: string;
    unit: string;
    baseline: number | null;
    target: number | null;
  } | null;
  /** Active initiatives linked to this element, by effective health. */
  initiatives: { total: number; byHealth: HealthCounts };
}

export interface StrategyMap {
  plan: {
    id: string;
    name: string;
    status: PlanStatus;
    version: number;
    startDate: string;
    endDate: string;
    approvedAt: string | null;
    vision: string | null;
    mission: string | null;
    values: string[];
    aspiration: string | null;
  };
  levels: (LevelView & { elementCount: number })[];
  totals: { kpis: number; activeInitiatives: number };
  /** Flat list ordered for display (depth, then sort order); build the tree with parentId. */
  elements: MapElement[];
}

const emptyHealth = (): HealthCounts => ({
  GREEN: 0,
  AMBER: 0,
  RED: 0,
  UNKNOWN: 0,
});

/**
 * Read model for the Strategy map screen: everything it draws in one call,
 * with a fixed number of queries regardless of plan size. Rollup scores are
 * read from stored columns (maintained by background recalculation), not
 * computed per request.
 */
@Injectable()
export class StrategyMapService {
  constructor(private readonly db: TenantPrismaService) {}

  async getMap(planId: string): Promise<StrategyMap> {
    const db = this.db.client;
    const plan = await db.strategicPlan.findUnique({ where: { id: planId } });
    if (!plan) throw planNotFound();

    const [levels, elements, kpis, links, activeInitiatives] =
      await Promise.all([
        db.frameworkLevel.findMany({
          where: { planId },
          orderBy: { depth: 'asc' },
          select: {
            id: true,
            depth: true,
            label: true,
            pluralLabel: true,
            codePrefix: true,
            allowsKpis: true,
            _count: { select: { elements: true } },
          },
        }),
        db.strategyElement.findMany({
          where: { planId },
          orderBy: [
            { level: { depth: 'asc' } },
            { sortOrder: 'asc' },
            { code: 'asc' },
          ],
          select: {
            id: true,
            parentId: true,
            levelId: true,
            code: true,
            title: true,
            sortOrder: true,
            executionScore: true,
            impactScore: true,
            health: true,
            level: { select: { depth: true } },
            owner: personSelect,
            sponsor: personSelect,
          },
        }),
        db.kpi.findMany({
          where: { element: { planId } },
          orderBy: { code: 'asc' },
          select: {
            elementId: true,
            name: true,
            unit: true,
            baseline: true,
            target: true,
          },
        }),
        db.initiativeObjectiveLink.findMany({
          where: { element: { planId }, initiative: { status: 'ACTIVE' } },
          select: {
            elementId: true,
            initiative: {
              select: { calculatedHealth: true, healthOverride: true },
            },
          },
        }),
        db.initiative.count({ where: { planId, status: 'ACTIVE' } }),
      ]);

    const kpisByElement = new Map<string, typeof kpis>();
    for (const kpi of kpis) {
      const list = kpisByElement.get(kpi.elementId) ?? [];
      list.push(kpi);
      kpisByElement.set(kpi.elementId, list);
    }
    const initiativesByElement = new Map<
      string,
      { total: number; byHealth: HealthCounts }
    >();
    for (const link of links) {
      const entry = initiativesByElement.get(link.elementId) ?? {
        total: 0,
        byHealth: emptyHealth(),
      };
      entry.total += 1;
      entry.byHealth[
        link.initiative.healthOverride ?? link.initiative.calculatedHealth
      ] += 1;
      initiativesByElement.set(link.elementId, entry);
    }

    return {
      plan: {
        id: plan.id,
        name: plan.name,
        status: plan.status,
        version: plan.version,
        startDate: toIsoDate(plan.startDate),
        endDate: toIsoDate(plan.endDate),
        approvedAt: plan.approvedAt?.toISOString() ?? null,
        vision: plan.vision,
        mission: plan.mission,
        values: plan.values,
        aspiration: plan.aspiration,
      },
      levels: levels.map(({ _count, ...level }) => ({
        ...level,
        elementCount: _count.elements,
      })),
      totals: { kpis: kpis.length, activeInitiatives },
      elements: elements.map((element) => {
        const elementKpis = kpisByElement.get(element.id) ?? [];
        const headline = elementKpis[0];
        return {
          id: element.id,
          parentId: element.parentId,
          levelId: element.levelId,
          depth: element.level.depth,
          code: element.code,
          title: element.title,
          sortOrder: element.sortOrder,
          owner: toPersonRef(element.owner),
          sponsor: toPersonRef(element.sponsor),
          executionScore: toNumber(element.executionScore),
          impactScore: toNumber(element.impactScore),
          health: element.health,
          kpiCount: elementKpis.length,
          headlineKpi: headline
            ? {
                name: headline.name,
                unit: headline.unit,
                baseline: toNumber(headline.baseline),
                target: toNumber(headline.target),
              }
            : null,
          initiatives: initiativesByElement.get(element.id) ?? {
            total: 0,
            byHealth: emptyHealth(),
          },
        };
      }),
    };
  }
}
