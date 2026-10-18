import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { toIsoDate, toNumber } from '../../common/data/numbers.js';
import type { HealthReason } from '../../domain/delivery/health.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { Health, InitiativeStatus } from '../../generated/prisma/enums.js';
import { TenantPrismaService } from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import { personSelect, toPersonRef } from '../people/person.js';
import { PlansService } from '../strategy/plans.service.js';
import { seesAllInitiatives } from './visibility.js';
import {
  REGISTER_TABS,
  type RegisterItem,
  type RegisterPage,
  type RegisterQuery,
  type RegisterTab,
} from '@sims/contracts';

const HEALTH_ORDER = Prisma.sql`CASE eff WHEN 'RED' THEN 0 WHEN 'AMBER' THEN 1 WHEN 'UNKNOWN' THEN 2 ELSE 3 END`;

const ORDER_BY: Record<RegisterQuery['sort'], Prisma.Sql> = {
  health: Prisma.sql`${HEALTH_ORDER}, "baselineEnd" ASC NULLS LAST, code ASC`,
  due: Prisma.sql`"baselineEnd" ASC NULLS LAST, code ASC`,
  '-due': Prisma.sql`"baselineEnd" DESC NULLS LAST, code ASC`,
  code: Prisma.sql`code ASC`,
  variance: Prisma.sql`("verifiedProgress" - "plannedProgress") ASC, code ASC`,
};

/** Escapes LIKE wildcards so a search for "50%" means the characters, not "anything". */
const likePattern = (text: string) =>
  `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * The Initiative register. One SQL statement computes each initiative's
 * effective health and home pillar (any tree depth), applies filters,
 * counts tabs and health chips, and returns one sorted page.
 *
 * Offset pagination is deliberate: a tenant has hundreds to low thousands of
 * initiatives, and the screen shows "Page 1 of 4" with jumps to any page.
 */
@Injectable()
export class InitiativeRegisterService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly plans: PlansService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(viewer: AuthContext, query: RegisterQuery): Promise<RegisterPage> {
    const planId = query.planId ?? (await this.plans.currentPlanId());
    if (query.planId) await this.plans.assertPlanExists(planId);
    const now = this.clock.now();

    const visibility = seesAllInitiatives(viewer)
      ? Prisma.empty
      : Prisma.sql`AND (i."isSensitive" = false OR ${viewer.membershipId}::uuid IN (i."ownerId", i."sponsorId", i."benefitsOwnerId"))`;
    const department = query.departmentId
      ? Prisma.sql`AND i."departmentId" = ${query.departmentId}::uuid`
      : Prisma.empty;
    const search = query.q
      ? Prisma.sql`AND (
          i.code ILIKE ${likePattern(query.q)} OR i.title ILIKE ${likePattern(query.q)}
          OR EXISTS (
            SELECT 1 FROM "Membership" m JOIN "User" u ON u.id = m."userId"
            WHERE m.id = i."ownerId"
              AND (u.name ILIKE ${likePattern(query.q)} OR m."jobTitle" ILIKE ${likePattern(query.q)})
          ))`
      : Prisma.empty;
    const element = query.elementId
      ? Prisma.sql`AND home_element_id IN (SELECT id FROM subtree)`
      : Prisma.empty;

    // `base`: every visible initiative of the plan with its effective health and pillar.
    const base = Prisma.sql`
      WITH RECURSIVE tree AS (
        SELECT id, id AS root FROM "StrategyElement" WHERE "planId" = ${planId}::uuid AND "parentId" IS NULL
        UNION ALL
        SELECT e.id, t.root FROM "StrategyElement" e JOIN tree t ON e."parentId" = t.id
      ),
      subtree AS (
        SELECT ${query.elementId ?? null}::uuid AS id
        UNION ALL
        SELECT e.id FROM "StrategyElement" e JOIN subtree s ON e."parentId" = s.id
      ),
      base AS (
        SELECT i.*,
          CASE WHEN i."healthOverride" IS NOT NULL AND i."overrideExpiresAt" > ${now}
               THEN i."healthOverride" ELSE i."calculatedHealth" END::text AS eff,
          link."elementId" AS home_element_id,
          tree.root AS pillar_id
        FROM "Initiative" i
        LEFT JOIN "InitiativeObjectiveLink" link ON link."initiativeId" = i.id AND link."isPrimary"
        LEFT JOIN tree ON tree.id = link."elementId"
        WHERE i."planId" = ${planId}::uuid ${visibility} ${department} ${search}
      ),
      filtered AS (SELECT * FROM base WHERE true ${element})`;

    const tabStatuses = [...REGISTER_TABS[query.tab]];
    const healthFilter = query.health?.length
      ? Prisma.sql`AND eff = ANY(${query.health}::text[])`
      : Prisma.empty;

    const [counts, page] = await this.db.transaction(async (tx) => {
      const counts = await tx.$queryRaw<
        { status: InitiativeStatus; eff: Health; n: number }[]
      >`
        ${base}
        SELECT status, eff, count(*)::int AS n FROM filtered GROUP BY status, eff`;
      const page = await tx.$queryRaw<{ id: string; total: number }[]>`
        ${base}
        SELECT id, count(*) OVER ()::int AS total FROM filtered
        WHERE status::text = ANY(${tabStatuses}::text[]) ${healthFilter}
        ORDER BY ${ORDER_BY[query.sort]}
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;
      return [counts, page] as const;
    });

    const tabCounts = { active: 0, pipeline: 0, closed: 0, cancelled: 0 };
    const healthCounts = { GREEN: 0, AMBER: 0, RED: 0, UNKNOWN: 0 };
    for (const row of counts) {
      const tab = (Object.keys(REGISTER_TABS) as RegisterTab[]).find((key) =>
        (REGISTER_TABS[key] as readonly string[]).includes(row.status),
      )!;
      tabCounts[tab] += row.n;
      if (tab === query.tab) healthCounts[row.eff] += row.n;
    }

    const items = await this.loadItems(
      page.map((row) => row.id),
      now,
    );
    const total =
      page[0]?.total ?? this.countPage(query, tabCounts, healthCounts);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      tabCounts,
      healthCounts,
    };
  }

  /** Total for an empty page (e.g. a page number past the end), from the counts already run. */
  private countPage(
    query: RegisterQuery,
    tabCounts: Record<RegisterTab, number>,
    healthCounts: Record<Health, number>,
  ): number {
    if (!query.health?.length) return tabCounts[query.tab];
    return query.health.reduce((sum, health) => sum + healthCounts[health], 0);
  }

  private async loadItems(ids: string[], now: Date): Promise<RegisterItem[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.client.initiative.findMany({
      where: { id: { in: ids } },
      include: {
        owner: personSelect,
        sponsor: personSelect,
        department: { select: { id: true, name: true } },
        objectiveLinks: {
          where: { isPrimary: true },
          select: {
            element: {
              select: { id: true, code: true, title: true, parentId: true },
            },
          },
        },
      },
    });
    const pillars = await this.topLevelElements(
      rows.flatMap((row) => row.objectiveLinks.map((link) => link.element)),
    );

    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => {
      const row = byId.get(id)!;
      const overridden =
        row.healthOverride !== null &&
        row.overrideExpiresAt !== null &&
        row.overrideExpiresAt > now;
      const verified = toNumber(row.verifiedProgress);
      const planned = toNumber(row.plannedProgress);
      const overdue = (
        (row.healthReasons ?? []) as unknown as HealthReason[]
      ).find((reason) => reason.rule === 'UPDATE_OVERDUE');
      const home = row.objectiveLinks[0]?.element;
      return {
        id: row.id,
        code: row.code,
        title: row.title,
        status: row.status,
        priority: row.priority,
        isSensitive: row.isSensitive,
        pillar: home ? (pillars.get(home.id) ?? null) : null,
        owner: toPersonRef(row.owner),
        sponsor: toPersonRef(row.sponsor),
        department: row.department,
        dueDate: toIsoDate(row.baselineEnd),
        forecastEnd: toIsoDate(row.forecastEnd),
        verifiedProgress: verified,
        plannedProgress: planned,
        variancePp: Math.round((verified - planned) * 10) / 10,
        health: overridden ? row.healthOverride! : row.calculatedHealth,
        calculatedHealth: row.calculatedHealth,
        overridden,
        impactScore: toNumber(row.impactScore),
        impactSummary: row.impactSummary,
        trajectory: row.trajectory,
        lastUpdateAt: row.lastUpdateAt?.toISOString() ?? null,
        updateOverdue: overdue
          ? {
              periodName: overdue.detail.split(' update overdue')[0],
              detail: overdue.detail,
            }
          : null,
      };
    });
  }

  /** Maps each element to its top-level ancestor, walking up as far as needed. */
  private async topLevelElements(
    elements: {
      id: string;
      code: string;
      title: string;
      parentId: string | null;
    }[],
  ) {
    const known = new Map(elements.map((e) => [e.id, e]));
    let pending = [
      ...new Set(
        elements
          .map((e) => e.parentId)
          .filter((id): id is string => !!id && !known.has(id)),
      ),
    ];
    while (pending.length) {
      const parents = await this.db.client.strategyElement.findMany({
        where: { id: { in: pending } },
        select: { id: true, code: true, title: true, parentId: true },
      });
      parents.forEach((p) => known.set(p.id, p));
      pending = [
        ...new Set(
          parents
            .map((p) => p.parentId)
            .filter((id): id is string => !!id && !known.has(id)),
        ),
      ];
    }
    const result = new Map<
      string,
      { id: string; code: string; title: string }
    >();
    for (const element of elements) {
      let node = element;
      while (node.parentId && known.has(node.parentId))
        node = known.get(node.parentId)!;
      result.set(element.id, {
        id: node.id,
        code: node.code,
        title: node.title,
      });
    }
    return result;
  }
}
