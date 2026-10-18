import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { toNumber } from '../../common/data/numbers.js';
import { stableStringify } from '../../common/data/stable-json.js';
import {
  calculateHealth,
  type HealthResult,
} from '../../domain/delivery/health.js';
import {
  plannedCompletion,
  verifiedCompletion,
} from '../../domain/delivery/progress.js';
import {
  DEFAULT_RULESET_CONFIG,
  parseRulesetConfig,
  type RulesetConfig,
} from '../../domain/rulesets/ruleset-config.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';

export interface RecalculationSummary {
  checked: number;
  changed: number;
  /** Codes whose status changed, with old → new. */
  healthChanges: { code: string; from: string; to: string }[];
}

/** Statuses an initiative has once submitted (anything but a draft counts as "in"). */
const SUBMITTED = ['SUBMITTED', 'CHALLENGED', 'REVIEWED', 'APPROVED'] as const;

/**
 * Keeps stored progress and health in step with the facts. Gathers each
 * initiative's facts in a fixed number of queries, runs the rules engine,
 * and writes only what changed.
 *
 * Runs after anything that affects health changes (milestones, issues,
 * dependencies, updates, rules) and daily, because planned progress and
 * overdue flags move with the calendar.
 */
@Injectable()
export class HealthRecalculationService {
  constructor(
    private readonly db: TenantPrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Every active initiative in the current organisation. */
  recalculateAll(): Promise<RecalculationSummary> {
    return this.db.transaction(
      (tx) => this.recalculate(tx, { status: 'ACTIVE' }),
      {
        timeout: 60_000,
      },
    );
  }

  /** Specific initiatives, inside the caller's transaction. */
  recalculateIn(
    tx: TenantTransactionClient,
    initiativeIds: string[],
  ): Promise<RecalculationSummary> {
    return this.recalculate(tx, {
      id: { in: initiativeIds },
      status: 'ACTIVE',
    });
  }

  private async recalculate(
    tx: TenantTransactionClient,
    where: Prisma.InitiativeWhereInput,
  ): Promise<RecalculationSummary> {
    const now = this.clock.now();
    const rules = await this.loadActiveRules(tx);

    const initiatives = await tx.initiative.findMany({
      where,
      select: {
        id: true,
        code: true,
        planId: true,
        baselineStart: true,
        activatedAt: true,
        calculatedHealth: true,
        healthReasons: true,
        verifiedProgress: true,
        plannedProgress: true,
        milestones: {
          select: {
            title: true,
            weight: true,
            isCritical: true,
            status: true,
            verifiedCompletion: true,
            baselineStartDate: true,
            baselineDate: true,
          },
        },
        risks: {
          where: { type: 'ISSUE', severity: 'CRITICAL', status: 'OPEN' },
          select: { title: true },
        },
        dependsOn: {
          where: { status: 'BLOCKED' },
          select: {
            blockedSince: true,
            isCriticalPath: true,
            toInitiative: { select: { code: true, title: true } },
          },
        },
      },
    });
    if (initiatives.length === 0)
      return { checked: 0, changed: 0, healthChanges: [] };

    const periods = await this.periodFacts(
      tx,
      [...new Set(initiatives.map((i) => i.planId))],
      now,
    );
    const submitted = await tx.statusUpdate.findMany({
      where: {
        initiativeId: { in: initiatives.map((i) => i.id) },
        periodId: {
          in: periods
            .flatMap((p) => [p.lockedId, p.openId])
            .filter((id): id is string => !!id),
        },
        status: { in: [...SUBMITTED] },
      },
      select: { initiativeId: true, periodId: true },
    });
    const hasUpdate = new Set(
      submitted.map((u) => `${u.initiativeId}:${u.periodId}`),
    );

    const summary: RecalculationSummary = {
      checked: initiatives.length,
      changed: 0,
      healthChanges: [],
    };
    for (const initiative of initiatives) {
      const plan = periods.find((p) => p.planId === initiative.planId);
      const milestones = initiative.milestones.map((m) => ({
        weight: toNumber(m.weight),
        verifiedCompletion: toNumber(m.verifiedCompletion),
        baselineStartDate: m.baselineStartDate,
        baselineDate: m.baselineDate,
      }));
      const verified = verifiedCompletion(milestones);
      const planned = plannedCompletion(
        milestones,
        now,
        initiative.baselineStart,
      );

      // An update is owed for a period only if the initiative was active
      // before the period's deadline and had started by the period's end.
      const owes = (period: { dueAt: Date | null; end: Date }) =>
        (!initiative.activatedAt ||
          !period.dueAt ||
          initiative.activatedAt < period.dueAt) &&
        (!initiative.baselineStart || initiative.baselineStart <= period.end);

      // Missed: owed in the last locked period, never reported.
      const missedUpdate =
        plan?.lockedId &&
        owes({ dueAt: plan.lockedDueAt, end: plan.lockedEnd! }) &&
        !hasUpdate.has(`${initiative.id}:${plan.lockedId}`)
          ? { periodName: plan.lockedName! }
          : null;
      // Overdue: owed in the open period, deadline passed, nothing in yet.
      const overdueUpdate =
        plan?.openId &&
        plan.openDueAt &&
        owes({ dueAt: plan.openDueAt, end: plan.openEnd! }) &&
        !hasUpdate.has(`${initiative.id}:${plan.openId}`)
          ? { periodName: plan.openName!, dueAt: plan.openDueAt }
          : null;

      const result = calculateHealth(
        {
          plannedProgress: planned,
          verifiedProgress: verified,
          criticalMilestones: initiative.milestones
            .filter((m) => m.isCritical)
            .map((m) => ({
              title: m.title,
              baselineDate: m.baselineDate,
              complete: m.status === 'COMPLETE',
            })),
          openCriticalIssues: initiative.risks,
          blockedDependencies: initiative.dependsOn
            .filter((d) => d.blockedSince)
            .map((d) => ({
              title: `${d.toInitiative.code} ${d.toInitiative.title}`,
              blockedSince: d.blockedSince!,
              isCriticalPath: d.isCriticalPath,
            })),
          missedUpdate,
          overdueUpdate,
          today: now,
        },
        rules.config,
      );

      if (!this.differs(initiative, verified, planned, result)) continue;
      summary.changed += 1;
      if (initiative.calculatedHealth !== result.health) {
        summary.healthChanges.push({
          code: initiative.code,
          from: initiative.calculatedHealth,
          to: result.health,
        });
      }
      await tx.initiative.update({
        where: { id: initiative.id },
        data: {
          verifiedProgress: verified,
          plannedProgress: planned,
          calculatedHealth: result.health,
          healthReasons: result.reasons as unknown as Prisma.InputJsonValue,
          rulesetVersion: rules.version,
        },
      });
    }
    return summary;
  }

  private differs(
    current: {
      calculatedHealth: string;
      healthReasons: unknown;
      verifiedProgress: { toNumber(): number };
      plannedProgress: { toNumber(): number };
    },
    verified: number,
    planned: number,
    result: HealthResult,
  ): boolean {
    return (
      current.calculatedHealth !== result.health ||
      toNumber(current.verifiedProgress) !== verified ||
      toNumber(current.plannedProgress) !== planned ||
      // jsonb reorders keys, so compare canonically.
      stableStringify(current.healthReasons) !== stableStringify(result.reasons)
    );
  }

  /** The organisation's active rules (defaults if none is active yet). */
  async loadActiveRules(
    tx: TenantTransactionClient,
  ): Promise<{ version: number | null; config: RulesetConfig }> {
    const active = await tx.ruleset.findFirst({
      where: { status: 'ACTIVE' },
      select: { version: true, config: true },
    });
    return active
      ? { version: active.version, config: parseRulesetConfig(active.config) }
      : { version: null, config: DEFAULT_RULESET_CONFIG };
  }

  /** Per plan: the most recent locked period, and the open period whose deadline has passed. */
  private async periodFacts(
    tx: TenantTransactionClient,
    planIds: string[],
    now: Date,
  ) {
    const periods = await tx.reportingPeriod.findMany({
      where: { planId: { in: planIds } },
      orderBy: { endDate: 'desc' },
      select: {
        id: true,
        planId: true,
        name: true,
        status: true,
        endDate: true,
        startDate: true,
        submissionDueAt: true,
      },
    });
    return planIds.map((planId) => {
      const own = periods.filter((p) => p.planId === planId);
      const locked = own.find((p) => p.status === 'LOCKED');
      const open = own.find(
        (p) =>
          p.status !== 'LOCKED' &&
          p.startDate <= now &&
          p.submissionDueAt !== null &&
          p.submissionDueAt < now,
      );
      return {
        planId,
        lockedId: locked?.id ?? null,
        lockedName: locked?.name ?? null,
        lockedEnd: locked?.endDate ?? null,
        lockedDueAt: locked?.submissionDueAt ?? null,
        openId: open?.id ?? null,
        openName: open?.name ?? null,
        openEnd: open?.endDate ?? null,
        openDueAt: open?.submissionDueAt ?? null,
      };
    });
  }
}
