import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { toIsoDate, toNumber } from '../../common/data/numbers.js';
import { effectiveHealth } from '../../domain/delivery/health.js';
import {
  benefitYear,
  isDeliveredLowValue,
} from '../../domain/performance/benefits.js';
import { STRATEGY_EDITOR_ROLES } from '../../domain/roles/roles.js';
import type { InitiativeStatus } from '../../generated/prisma/enums.js';
import {
  TenantContext,
  TenantPrismaService,
} from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import { loadActiveRules } from '../delivery/element-rollups.js';
import { visibleInitiativeWhere } from '../delivery/visibility.js';
import { topLevelResolver } from '../kpis/kpi-view.js';
import { PlansService } from '../strategy/plans.service.js';
import type {
  LowValueItem,
  Performance,
  PerformanceQuery,
  ScorecardRow,
} from '@sims/contracts';

/** Initiatives whose business case is approved: their benefits count. */
const APPROVED: InitiativeStatus[] = [
  'APPROVED',
  'ACTIVE',
  'ON_HOLD',
  'CLOSED',
];
const LOW_VALUE_SHOWN = 10;
const TREND_POINTS = 6;

/**
 * The "KPIs & benefits realisation" page: is delivered work creating the
 * value it promised? Benefits and initiatives follow the viewer's
 * visibility (sensitive initiatives only for those who may see them).
 */
@Injectable()
export class PerformanceService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly plans: PlansService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(
    viewer: AuthContext,
    query: PerformanceQuery,
  ): Promise<Performance> {
    const now = this.clock.now();
    const asAt = toIsoDate(now);
    const planId = await this.plans.currentPlanId();
    const db = this.db.client;
    const plan = await db.strategicPlan.findUniqueOrThrow({
      where: { id: planId },
      select: { id: true, name: true, startDate: true, endDate: true },
    });

    const first = plan.startDate.getUTCFullYear();
    const last = plan.endDate.getUTCFullYear();
    const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    const year =
      query.year ?? Math.min(last, Math.max(first, now.getUTCFullYear()));
    if (!years.includes(year)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Some fields are missing or invalid.',
        errors: [
          {
            path: 'year',
            message: `Choose a year of the plan (${first} to ${last})`,
            code: 'custom',
          },
        ],
      });
    }
    const yearEnd = `${year}-12-31`;
    const visible = visibleInitiativeWhere(viewer);

    const [organisation, rules, benefits, elements, kpis, initiatives] =
      await Promise.all([
        db.organisation.findUniqueOrThrow({
          where: { id: TenantContext.require().organisationId },
          select: { currency: true },
        }),
        this.db.transaction((tx) => loadActiveRules(tx)),
        db.benefit.findMany({
          where: {
            type: 'FINANCIAL',
            initiative: { planId, status: { in: APPROVED }, ...visible },
          },
          select: {
            profile: {
              select: {
                periodEnd: true,
                expectedValue: true,
                forecastValue: true,
              },
            },
            actuals: {
              where: { verifiedAt: { not: null } },
              select: {
                realisedValue: true,
                period: { select: { endDate: true } },
              },
            },
          },
        }),
        db.strategyElement.findMany({
          where: { planId },
          select: { id: true, code: true, title: true, parentId: true },
        }),
        db.kpi.findMany({
          where: { element: { planId } },
          orderBy: { code: 'asc' },
          include: {
            targets: { orderBy: { targetDate: 'asc' } },
            actuals: {
              where: {
                verifiedAt: { not: null },
                period: { endDate: { lte: new Date(yearEnd) } },
              },
              orderBy: { period: { endDate: 'desc' } },
              take: TREND_POINTS,
              select: {
                value: true,
                period: { select: { name: true, endDate: true } },
              },
            },
          },
        }),
        db.initiative.findMany({
          where: {
            planId,
            status: { in: ['ACTIVE', 'CLOSED'] },
            impactScore: { not: null },
            ...visible,
          },
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            calculatedHealth: true,
            healthOverride: true,
            overrideExpiresAt: true,
            verifiedProgress: true,
            impactScore: true,
            impactSummary: true,
          },
        }),
      ]);

    const benefitFigures = benefitYear(
      year,
      benefits.flatMap((b) =>
        b.profile.map((p) => ({
          periodEnd: toIsoDate(p.periodEnd),
          expected: toNumber(p.expectedValue),
          forecast: toNumber(p.forecastValue),
        })),
      ),
      benefits.flatMap((b) =>
        b.actuals.map((a) => ({
          periodEnd: toIsoDate(a.period.endDate),
          realised: toNumber(a.realisedValue),
        })),
      ),
      asAt,
    );

    const topLevelOf = topLevelResolver(elements);
    const scorecard = kpis.map((kpi): ScorecardRow => {
      const due = kpi.targets.find(
        (t) => toIsoDate(t.targetDate) >= `${year}-01-01`,
      );
      return {
        id: kpi.id,
        code: kpi.code,
        name: kpi.name,
        unit: kpi.unit,
        direction: kpi.direction,
        topLevel: topLevelOf(kpi.elementId),
        baseline: toNumber(kpi.baseline),
        target: due ? toNumber(due.value) : toNumber(kpi.target),
        targetLabel: due?.label ?? null,
        latestValue: toNumber(kpi.latestValue),
        latestAt: toIsoDate(kpi.latestAt),
        trajectory: kpi.trajectory,
        trend: kpi.actuals
          .map((a) => ({
            period: a.period.name,
            periodEnd: toIsoDate(a.period.endDate),
            value: toNumber(a.value),
          }))
          .reverse(),
      };
    });
    const countOf = (trajectory: ScorecardRow['trajectory']) =>
      scorecard.filter((k) => k.trajectory === trajectory).length;

    const threshold = rules.config.impact.lowValueThresholdPct;
    const lowValue = initiatives
      .map((i): LowValueItem => ({
        initiativeId: i.id,
        code: i.code,
        title: i.title,
        status: i.status,
        health: effectiveHealth(i, now).health,
        delivery: toNumber(i.verifiedProgress),
        impactScore: toNumber(i.impactScore)!,
        impactSummary: i.impactSummary,
      }))
      .filter((i) => isDeliveredLowValue(i, threshold))
      .sort(
        (a, b) => a.impactScore - b.impactScore || a.code.localeCompare(b.code),
      );

    const office = viewer.roles.some((role) =>
      (STRATEGY_EDITOR_ROLES as readonly string[]).includes(role),
    );
    return {
      plan: { id: plan.id, name: plan.name },
      year,
      years,
      asAt,
      currency: organisation.currency,
      benefits: {
        expected: benefitFigures.expected,
        expectedToDate: benefitFigures.expectedToDate,
        realisedToDate: benefitFigures.realisedToDate,
        realisedPctOfExpected: benefitFigures.realisedPctOfExpected,
        quarters: benefitFigures.quarters,
      },
      kpis: {
        total: scorecard.length,
        onTrajectory: countOf('ON_TRAJECTORY'),
        slightlyBehind: countOf('SLIGHTLY_BEHIND'),
        offTrajectory: countOf('OFF_TRAJECTORY'),
        notMeasurable: countOf('NOT_MEASURABLE'),
      },
      lowValue: {
        thresholdPct: threshold,
        count: lowValue.length,
        items: lowValue.slice(0, LOW_VALUE_SHOWN),
      },
      scorecard,
      can: {
        recordKpiActuals:
          office || kpis.some((k) => k.ownerId === viewer.membershipId),
      },
    };
  }
}
