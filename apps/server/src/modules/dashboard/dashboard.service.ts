import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { toIsoDate, toNumber } from '../../common/data/numbers.js';
import { daysBetween } from '../../domain/delivery/progress.js';
import {
  valueQuadrant,
  type ValueQuadrant,
} from '../../domain/strategy/rollup.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  Health,
  InitiativeStatus,
  MilestoneStatus,
  PeriodStatus,
  Role,
  Severity,
} from '../../generated/prisma/enums.js';
import { TenantPrismaService } from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import { loadActiveRules } from '../delivery/element-rollups.js';
import {
  InitiativeRegisterService,
  type RegisterItem,
} from '../delivery/initiative-register.service.js';
import { REGISTER_TABS } from '../delivery/delivery.schemas.js';
import { seesAllInitiatives } from '../delivery/visibility.js';
import {
  DecisionsService,
  type DecisionView,
} from '../governance/decisions.service.js';
import { personSelect, type PersonRef, toPersonRef } from '../people/person.js';
import {
  PeriodsService,
  type PeriodSummary,
} from '../reporting/periods.service.js';
import { PlansService } from '../strategy/plans.service.js';
import type { DashboardQuery } from './dashboard.schemas.js';

/** How many rows each "top N" panel shows. */
const WATCHLIST_SIZE = 5;
const DECISIONS_SHOWN = 3;
const ESCALATIONS_SHOWN = 3;
const MILESTONES_SHOWN = 8;
const MILESTONE_WINDOW_DAYS = 14;
/** Dots per quadrant in the delivery-vs-value matrix (counts are always exact). */
const MATRIX_ITEMS_PER_QUADRANT = 50;

const QUADRANTS: ValueQuadrant[] = [
  'ON_PLAN_VALUE_OK',
  'ON_PLAN_VALUE_LOW',
  'BEHIND_VALUE_OK',
  'BEHIND_VALUE_LOW',
  'NOT_MEASURABLE',
];

type StageKey =
  'OWNER_SUBMISSION' | 'STRATEGY_REVIEW' | 'SPONSOR_REVIEW' | 'REPORT_ISSUE';

export interface CycleStage {
  key: StageKey;
  dueAt: string | null;
  state: 'DONE' | 'CURRENT' | 'UPCOMING';
}

export interface ElementPerformance {
  id: string;
  code: string;
  title: string;
  health: Health;
  executionScore: number | null;
  impactScore: number | null;
  /** Active and on-hold initiatives the viewer can see whose home objective sits here. */
  initiatives: number;
  atRisk: number;
  delayed: number;
}

export interface MatrixPoint {
  id: string;
  code: string;
  title: string;
  health: Health;
  impactScore: number | null;
}

export interface EscalationSummary {
  id: string;
  reference: string;
  title: string;
  severity: Severity;
  level: number;
  levelName: string;
  /** Days since it reached its current level. */
  daysAtLevel: number;
  /** Days since it was raised. */
  ageDays: number;
  initiative: { id: string; code: string; title: string } | null;
  decisionFrom: PersonRef | null;
  decisionFromRole: Role | null;
}

export interface MilestoneDue {
  id: string;
  title: string;
  initiative: { id: string; code: string; title: string };
  /** Forecast date if there is one, else the baseline date. */
  dueDate: string;
  baselineDate: string;
  /** Forecast minus baseline, in days (positive = slipping). */
  slipDays: number;
  isCritical: boolean;
  status: MilestoneStatus;
  verifiedCompletion: number;
}

export interface Dashboard {
  plan: { id: string; name: string; startDate: string; endDate: string };
  asAt: string;
  /** The element the dashboard is narrowed to, or null for the whole plan. */
  scope: { id: string; code: string; title: string } | null;
  cycle: (PeriodSummary & { stages: CycleStage[] }) | null;
  tiles: {
    active: number;
    onTrack: number;
    atRisk: number;
    delayed: number;
    unknown: number;
    /** Updates still owed this cycle (whole organisation); null between cycles. */
    updatesOutstanding: number | null;
  };
  /** Top-level elements, or the scope's children. */
  performance: ElementPerformance[];
  matrix: {
    lowValueThresholdPct: number;
    quadrants: Record<ValueQuadrant, { count: number; items: MatrixPoint[] }>;
  };
  watchlist: RegisterItem[];
  decisions: { items: DecisionView[]; total: number };
  escalations: {
    items: EscalationSummary[];
    total: number;
    /** Every level of the organisation's ladder, with its open count. */
    byLevel: { level: number; name: string; count: number }[];
  };
  milestones: { items: MilestoneDue[]; total: number; overdue: number };
}

interface InitiativeRow {
  id: string;
  code: string;
  title: string;
  status: InitiativeStatus;
  eff: Health;
  impactScore: Prisma.Decimal | null;
  rowId: string | null;
}

const STAGES: { key: StageKey; status: PeriodStatus | null }[] = [
  { key: 'OWNER_SUBMISSION', status: 'OWNER_SUBMISSION' },
  { key: 'STRATEGY_REVIEW', status: 'STRATEGY_REVIEW' },
  { key: 'SPONSOR_REVIEW', status: 'SPONSOR_REVIEW' },
  { key: 'REPORT_ISSUE', status: null },
];
const STAGE_ORDER: PeriodStatus[] = [
  'OPEN',
  'OWNER_SUBMISSION',
  'STRATEGY_REVIEW',
  'SPONSOR_REVIEW',
  'LOCKED',
];

/**
 * The Strategy Execution Command Centre in one call. Each panel reuses the
 * service behind its own screen (register, reporting cycle, decisions), so
 * the dashboard never disagrees with the page it links to.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly plans: PlansService,
    private readonly register: InitiativeRegisterService,
    private readonly periods: PeriodsService,
    private readonly decisions: DecisionsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(viewer: AuthContext, query: DashboardQuery): Promise<Dashboard> {
    const now = this.clock.now();
    const planId = await this.plans.currentPlanId();
    const [plan, scope, rules] = await Promise.all([
      this.db.client.strategicPlan.findUniqueOrThrow({
        where: { id: planId },
        select: { id: true, name: true, startDate: true, endDate: true },
      }),
      query.elementId ? this.findScope(planId, query.elementId) : null,
      this.db.transaction((tx) => loadActiveRules(tx)),
    ]);

    const initiatives = await this.initiativesInScope(viewer, planId, scope);
    // "Active" means what the register's Active tab shows: in delivery or on hold.
    const inDelivery = new Set<InitiativeStatus>(REGISTER_TABS.active);
    const active = initiatives.filter((i) => inDelivery.has(i.status));
    // Scoped panels list items of initiatives under the scope; unscoped ones
    // include organisation-wide items (no initiative) too.
    const scopedIds = scope ? initiatives.map((i) => i.id) : null;

    const [registerPage, cycle, decisions, escalations, milestones, elements] =
      await Promise.all([
        this.register.list(viewer, {
          tab: 'active',
          sort: 'health',
          page: 1,
          pageSize: WATCHLIST_SIZE,
          elementId: scope?.id,
          planId,
        }),
        this.periods.current(),
        this.decisions.openSummary(viewer, scopedIds, DECISIONS_SHOWN),
        this.escalations(
          viewer,
          scopedIds,
          rules.config.escalation.levels,
          now,
        ),
        this.milestones(
          active.map((i) => i.id),
          now,
        ),
        this.db.client.strategyElement.findMany({
          where: { planId, parentId: scope?.id ?? null },
          orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
          select: {
            id: true,
            code: true,
            title: true,
            health: true,
            executionScore: true,
            impactScore: true,
          },
        }),
      ]);

    const { healthCounts } = registerPage;
    return {
      plan: {
        id: plan.id,
        name: plan.name,
        startDate: toIsoDate(plan.startDate)!,
        endDate: toIsoDate(plan.endDate)!,
      },
      asAt: now.toISOString(),
      scope,
      cycle: cycle ? { ...cycle, stages: stagesOf(cycle) } : null,
      tiles: {
        active: registerPage.tabCounts.active,
        onTrack: healthCounts.GREEN,
        atRisk: healthCounts.AMBER,
        delayed: healthCounts.RED,
        unknown: healthCounts.UNKNOWN,
        updatesOutstanding: cycle ? cycle.counts.outstanding : null,
      },
      performance: elements.map((element) => {
        const mine = active.filter((i) => i.rowId === element.id);
        return {
          id: element.id,
          code: element.code,
          title: element.title,
          health: element.health,
          executionScore: toNumber(element.executionScore),
          impactScore: toNumber(element.impactScore),
          initiatives: mine.length,
          atRisk: mine.filter((i) => i.eff === 'AMBER').length,
          delayed: mine.filter((i) => i.eff === 'RED').length,
        };
      }),
      matrix: {
        lowValueThresholdPct: rules.config.impact.lowValueThresholdPct,
        quadrants: matrixOf(active, rules.config.impact.lowValueThresholdPct),
      },
      watchlist: registerPage.items,
      decisions,
      escalations,
      milestones,
    };
  }

  private async findScope(planId: string, elementId: string) {
    const element = await this.db.client.strategyElement.findFirst({
      where: { id: elementId, planId },
      select: { id: true, code: true, title: true },
    });
    if (!element) {
      throw new NotFoundException({
        code: 'ELEMENT_NOT_FOUND',
        message: 'Strategy element not found in the current plan.',
      });
    }
    return element;
  }

  /**
   * Every initiative the viewer can see in the plan (or under the scope), with
   * its effective health and the displayed element it rolls up to (`rowId`).
   * Same visibility and effective-health rules as the register.
   */
  private initiativesInScope(
    viewer: AuthContext,
    planId: string,
    scope: { id: string } | null,
  ): Promise<InitiativeRow[]> {
    const now = this.clock.now();
    const visibility = seesAllInitiatives(viewer)
      ? Prisma.empty
      : Prisma.sql`AND (i."isSensitive" = false OR ${viewer.membershipId}::uuid IN (i."ownerId", i."sponsorId", i."benefitsOwnerId"))`;
    const roots = scope
      ? Prisma.sql`"parentId" = ${scope.id}::uuid`
      : Prisma.sql`"parentId" IS NULL`;
    const inScope = scope
      ? Prisma.sql`AND (rows."rowId" IS NOT NULL OR link."elementId" = ${scope.id}::uuid)`
      : Prisma.empty;
    return this.db.transaction(
      (tx) => tx.$queryRaw<InitiativeRow[]>`
        WITH RECURSIVE rows AS (
          SELECT id, id AS "rowId" FROM "StrategyElement"
          WHERE "planId" = ${planId}::uuid AND ${roots}
          UNION ALL
          SELECT e.id, r."rowId" FROM "StrategyElement" e JOIN rows r ON e."parentId" = r.id
        )
        SELECT i.id, i.code, i.title, i.status, i."impactScore", rows."rowId",
          CASE WHEN i."healthOverride" IS NOT NULL AND i."overrideExpiresAt" > ${now}
               THEN i."healthOverride" ELSE i."calculatedHealth" END::text AS eff
        FROM "Initiative" i
        LEFT JOIN "InitiativeObjectiveLink" link ON link."initiativeId" = i.id AND link."isPrimary"
        LEFT JOIN rows ON rows.id = link."elementId"
        WHERE i."planId" = ${planId}::uuid ${visibility} ${inScope}
        ORDER BY i.code`,
    );
  }

  private async escalations(
    viewer: AuthContext,
    initiativeIds: string[] | null,
    levels: { level: number; name: string }[],
    now: Date,
  ): Promise<Dashboard['escalations']> {
    const where: Prisma.EscalationWhereInput = {
      AND: [
        { status: 'OPEN' },
        initiativeIds ? { initiativeId: { in: initiativeIds } } : {},
        seesAllInitiatives(viewer)
          ? {}
          : {
              OR: [
                { initiativeId: null },
                { initiative: { isSensitive: false } },
                { initiative: { ownerId: viewer.membershipId } },
                { initiative: { sponsorId: viewer.membershipId } },
                { initiative: { benefitsOwnerId: viewer.membershipId } },
              ],
            },
      ],
    };
    const [rows, counts] = await Promise.all([
      this.db.client.escalation.findMany({
        where,
        // Highest level first, then the longest waiting at that level.
        orderBy: [{ level: 'desc' }, { levelChangedAt: 'asc' }],
        take: ESCALATIONS_SHOWN,
        include: {
          initiative: { select: { id: true, code: true, title: true } },
          decisionFrom: personSelect,
        },
      }),
      this.db.client.escalation.groupBy({
        by: ['level'],
        where,
        _count: { _all: true },
      }),
    ]);
    const nameOf = (level: number) =>
      levels.find((l) => l.level === level)?.name ?? `Level ${level}`;
    const countAt = (level: number) =>
      counts.find((c) => c.level === level)?._count._all ?? 0;
    // Items left above the ladder after it was shortened still get counted.
    const allLevels = [
      ...new Set([
        ...levels.map((l) => l.level),
        ...counts.map((c) => c.level),
      ]),
    ].sort((a, b) => a - b);
    return {
      items: rows.map((row) => ({
        id: row.id,
        reference: row.reference,
        title: row.title,
        severity: row.severity,
        level: row.level,
        levelName: nameOf(row.level),
        daysAtLevel: Math.max(0, daysBetween(row.levelChangedAt, now)),
        ageDays: Math.max(0, daysBetween(row.raisedAt, now)),
        initiative: row.initiative,
        decisionFrom: toPersonRef(row.decisionFrom),
        decisionFromRole: row.decisionFromRole,
      })),
      total: counts.reduce((sum, c) => sum + c._count._all, 0),
      byLevel: allLevels.map((level) => ({
        level,
        name: nameOf(level),
        count: countAt(level),
      })),
    };
  }

  /** Open milestones of the given initiatives due in the next two weeks. */
  private async milestones(
    initiativeIds: string[],
    now: Date,
  ): Promise<Dashboard['milestones']> {
    const today = new Date(`${toIsoDate(now)}T00:00:00Z`);
    const horizon = new Date(
      today.getTime() + MILESTONE_WINDOW_DAYS * 86_400_000,
    );
    const open: Prisma.MilestoneWhereInput = {
      initiativeId: { in: initiativeIds },
      status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
    };
    // "Due" means the forecast date when there is one, else the baseline date.
    const dueBetween = (range: Prisma.DateTimeFilter) => ({
      OR: [
        { forecastDate: range },
        { forecastDate: null, baselineDate: range },
      ],
    });
    const [rows, overdue] = await Promise.all([
      this.db.client.milestone.findMany({
        where: { AND: [open, dueBetween({ gte: today, lte: horizon })] },
        include: {
          initiative: { select: { id: true, code: true, title: true } },
        },
      }),
      this.db.client.milestone.count({
        where: { AND: [open, dueBetween({ lt: today })] },
      }),
    ]);
    const items = rows
      .map((row) => {
        const due = row.forecastDate ?? row.baselineDate;
        return {
          id: row.id,
          title: row.title,
          initiative: row.initiative,
          dueDate: toIsoDate(due)!,
          baselineDate: toIsoDate(row.baselineDate)!,
          slipDays: daysBetween(row.baselineDate, due),
          isCritical: row.isCritical,
          status: row.status,
          verifiedCompletion: toNumber(row.verifiedCompletion) ?? 0,
        };
      })
      .sort(
        (a, b) =>
          a.dueDate.localeCompare(b.dueDate) ||
          Number(b.isCritical) - Number(a.isCritical) ||
          a.initiative.code.localeCompare(b.initiative.code),
      );
    return {
      items: items.slice(0, MILESTONES_SHOWN),
      total: items.length,
      overdue,
    };
  }
}

/** The cycle's stages with done / current / upcoming, from the period's status. */
function stagesOf(period: PeriodSummary): CycleStage[] {
  const position = STAGE_ORDER.indexOf(period.status);
  const due: Record<StageKey, string | null> = {
    OWNER_SUBMISSION: period.deadlines.submissionDueAt,
    STRATEGY_REVIEW: period.deadlines.strategyReviewDueAt,
    SPONSOR_REVIEW: period.deadlines.sponsorReviewDueAt,
    REPORT_ISSUE: period.deadlines.reportIssueDueAt,
  };
  return STAGES.map(({ key, status }) => {
    // The report is issued when the period locks.
    const at = status ? STAGE_ORDER.indexOf(status) : STAGE_ORDER.length - 1;
    return {
      key,
      dueAt: due[key],
      state: at < position ? 'DONE' : at === position ? 'CURRENT' : 'UPCOMING',
    };
  });
}

function matrixOf(
  active: InitiativeRow[],
  threshold: number,
): Dashboard['matrix']['quadrants'] {
  const quadrants = Object.fromEntries(
    QUADRANTS.map((q) => [q, { count: 0, items: [] as MatrixPoint[] }]),
  ) as Dashboard['matrix']['quadrants'];
  for (const row of active) {
    const impactScore = toNumber(row.impactScore);
    const cell = quadrants[valueQuadrant(row.eff, impactScore, threshold)];
    cell.count += 1;
    if (cell.items.length < MATRIX_ITEMS_PER_QUADRANT) {
      cell.items.push({
        id: row.id,
        code: row.code,
        title: row.title,
        health: row.eff,
        impactScore,
      });
    }
  }
  return quadrants;
}
