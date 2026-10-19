import { toIsoDate, toNumber } from '../../common/data/numbers.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { effectiveHealth } from '../../domain/delivery/health.js';
import { benefitYear } from '../../domain/performance/benefits.js';
import type { SnapshotDataV2 } from '../../domain/reports/snapshot-data.js';
import type { RulesetConfig } from '../../domain/rulesets/ruleset-config.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Health } from '../../generated/prisma/enums.js';

/** Business cases that count for benefits (as on the performance page). */
const APPROVED = ['APPROVED', 'ACTIVE', 'ON_HOLD', 'CLOSED'] as const;

/**
 * Freezes everything a report needs for one period (see SnapshotDataV2) and
 * stores it as a ReportSnapshot. Shared by locking a period and the demo
 * seed, so both produce the same shape. Runs inside the caller's
 * transaction; queries run one at a time (a transaction is one connection).
 */
export async function captureReportSnapshot(
  tx: Prisma.TransactionClient,
  input: {
    organisationId: string;
    period: {
      id: string;
      planId: string;
      name: string;
      startDate: Date;
      endDate: Date;
    };
    rules: RulesetConfig;
    now: Date;
    createdById: string | null;
    kind?: string;
  },
): Promise<string> {
  const { period, rules, now } = input;
  const plan = await tx.strategicPlan.findUniqueOrThrow({
    where: { id: period.planId },
    select: { name: true },
  });
  const organisation = await tx.organisation.findUniqueOrThrow({
    where: { id: input.organisationId },
    select: { currency: true },
  });
  const elements = await tx.strategyElement.findMany({
    where: { planId: period.planId },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      parentId: true,
      code: true,
      title: true,
      health: true,
      executionScore: true,
      impactScore: true,
    },
  });
  const parentOf = new Map(elements.map((e) => [e.id, e.parentId]));
  const pillarOf = (id: string | null) => {
    let node = id;
    while (node && parentOf.get(node)) node = parentOf.get(node)!;
    return node;
  };

  const initiatives = await tx.initiative.findMany({
    where: { planId: period.planId, status: { in: ['ACTIVE', 'ON_HOLD'] } },
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      isSensitive: true,
      calculatedHealth: true,
      healthOverride: true,
      overrideExpiresAt: true,
      verifiedProgress: true,
      plannedProgress: true,
      impactScore: true,
      impactSummary: true,
      owner: { select: { jobTitle: true, user: { select: { name: true } } } },
      objectiveLinks: {
        where: { isPrimary: true },
        select: { elementId: true },
      },
    },
  });
  const byHealth: Record<Health, number> = {
    GREEN: 0,
    AMBER: 0,
    RED: 0,
    UNKNOWN: 0,
  };
  const initiativeRows = initiatives.map((i) => {
    const health = effectiveHealth(i, now);
    byHealth[health.health] += 1;
    const home = i.objectiveLinks[0]?.elementId ?? null;
    return {
      initiativeId: i.id,
      code: i.code,
      title: i.title,
      status: i.status,
      isSensitive: i.isSensitive,
      homeElementId: home,
      pillarId: pillarOf(home),
      owner: i.owner ? (i.owner.jobTitle ?? i.owner.user.name) : null,
      health: health.health,
      calculatedHealth: i.calculatedHealth,
      overridden: health.overridden,
      verifiedProgress: toNumber(i.verifiedProgress),
      plannedProgress: toNumber(i.plannedProgress),
      impactScore: toNumber(i.impactScore),
      impactSummary: i.impactSummary,
    };
  });

  const periodEnd = toIsoDate(period.endDate);
  const kpis = await tx.kpi.findMany({
    where: { element: { planId: period.planId } },
    orderBy: { code: 'asc' },
    include: { targets: { orderBy: { targetDate: 'asc' } } },
  });

  const decisions = await tx.decision.findMany({
    where: { organisationId: input.organisationId, outcome: 'PENDING' },
    orderBy: [
      { dueDate: { sort: 'asc', nulls: 'last' } },
      { reference: 'asc' },
    ],
    select: {
      reference: true,
      title: true,
      requiredFrom: true,
      initiativeId: true,
      dueDate: true,
    },
  });

  const openByLevel = await tx.escalation.groupBy({
    by: ['level'],
    where: { organisationId: input.organisationId, status: 'OPEN' },
    _count: { _all: true },
  });

  const year = period.endDate.getUTCFullYear();
  const benefits = await tx.benefit.findMany({
    where: {
      type: 'FINANCIAL',
      initiative: { planId: period.planId, status: { in: [...APPROVED] } },
    },
    select: {
      profile: {
        select: { periodEnd: true, expectedValue: true, forecastValue: true },
      },
      actuals: {
        where: { verifiedAt: { not: null } },
        select: { realisedValue: true, period: { select: { endDate: true } } },
      },
    },
  });
  const figures = benefitYear(
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
    periodEnd,
  );

  const data: SnapshotDataV2 = {
    version: 2,
    period: {
      id: period.id,
      name: period.name,
      startDate: toIsoDate(period.startDate),
      endDate: periodEnd,
    },
    lockedAt: now.toISOString(),
    plan: { name: plan.name },
    thresholds: { lowValueThresholdPct: rules.impact.lowValueThresholdPct },
    totals: { initiatives: initiativeRows.length, byHealth },
    initiatives: initiativeRows,
    elements: elements.map((e) => ({
      id: e.id,
      parentId: e.parentId,
      code: e.code,
      title: e.title,
      health: e.health,
      executionScore: toNumber(e.executionScore),
      impactScore: toNumber(e.impactScore),
    })),
    kpis: kpis.map((k) => {
      const due = k.targets.find((t) => toIsoDate(t.targetDate) >= periodEnd);
      return {
        code: k.code,
        name: k.name,
        unit: k.unit,
        elementId: k.elementId,
        baseline: toNumber(k.baseline),
        target: due ? toNumber(due.value) : toNumber(k.target),
        latestValue: toNumber(k.latestValue),
        trajectory: k.trajectory,
      };
    }),
    decisions: decisions.map((d) => ({
      reference: d.reference,
      title: d.title,
      requiredFrom: d.requiredFrom,
      initiativeId: d.initiativeId,
      dueDate: toIsoDate(d.dueDate),
    })),
    escalations: {
      byLevel: rules.escalation.levels.map((l) => ({
        level: l.level,
        name: l.name,
        open: openByLevel.find((c) => c.level === l.level)?._count._all ?? 0,
      })),
    },
    benefits: {
      currency: organisation.currency,
      year,
      expected: figures.expected,
      expectedToDate: figures.expectedToDate,
      realisedToDate: figures.realisedToDate,
      realisedPctOfExpected: figures.realisedPctOfExpected,
      quarters: figures.quarters.map((q) => ({
        label: q.label,
        expected: q.expected,
        realised: q.realised,
        forecast: q.forecast,
      })),
    },
  };

  const id = uuidv7();
  await tx.reportSnapshot.create({
    data: {
      id,
      organisationId: input.organisationId,
      periodId: period.id,
      kind: input.kind ?? 'PERIOD_LOCK',
      createdById: input.createdById,
      data: data as unknown as Prisma.InputJsonValue,
    },
  });
  return id;
}
