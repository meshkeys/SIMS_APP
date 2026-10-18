import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { toNumber } from '../../common/data/numbers.js';
import { stableStringify } from '../../common/data/stable-json.js';
import {
  loadActiveRules,
  recalculateElementRollups,
} from './element-rollups.js';
import {
  calculateHealth,
  type HealthFacts,
  type HealthResult,
} from '../../domain/delivery/health.js';
import {
  plannedCompletion,
  verifiedCompletion,
} from '../../domain/delivery/progress.js';
import type { RulesetConfig } from '../../domain/rulesets/ruleset-config.js';
import {
  owesUpdate,
  SUBMITTED_STATUSES,
} from '../../domain/reporting/obligations.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import type { RecalculationSummary } from '@sims/contracts';

/** Statuses an initiative has once submitted (anything but a draft counts as "in"). */
const SUBMITTED = SUBMITTED_STATUSES;

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

  /**
   * Health as it would be with different verified progress — used by the
   * update form to preview the status the owner's claims would give.
   * The open period's overdue flag is dropped: submitting clears it.
   */
  async previewHealth(
    tx: TenantTransactionClient,
    initiativeId: string,
    verifiedProgress: number,
  ): Promise<HealthResult | null> {
    const { rules, items } = await this.gather(tx, { id: initiativeId });
    const item = items[0];
    if (!item) return null;
    return calculateHealth(
      { ...item.facts, verifiedProgress, overdueUpdate: null },
      rules.config,
    );
  }

  /** Everything the rules engine needs, for each matching initiative. */
  private async gather(
    tx: TenantTransactionClient,
    where: Prisma.InitiativeWhereInput,
  ) {
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
    if (initiatives.length === 0) return { rules, items: [] };

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

    const items = initiatives.map((initiative) => {
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
        owesUpdate(initiative, {
          submissionDueAt: period.dueAt,
          endDate: period.end,
        });

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

      const facts: HealthFacts = {
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
      };
      return { initiative, verified, planned, facts };
    });
    return { rules, items };
  }

  private async recalculate(
    tx: TenantTransactionClient,
    where: Prisma.InitiativeWhereInput,
  ): Promise<RecalculationSummary> {
    const { rules, items } = await this.gather(tx, where);
    const summary: RecalculationSummary = {
      checked: items.length,
      changed: 0,
      healthChanges: [],
      elementsChanged: 0,
    };
    for (const { initiative, verified, planned, facts } of items) {
      const result = calculateHealth(facts, rules.config);

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
    summary.elementsChanged = await this.recalculateRollups(tx, [
      ...new Set(items.map((item) => item.initiative.planId)),
    ]);
    return summary;
  }

  /** Re-rolls pillar/objective scores for plans (e.g. after a status change). */
  async recalculateRollups(
    tx: TenantTransactionClient,
    planIds: string[],
  ): Promise<number> {
    const rules = await this.loadActiveRules(tx);
    const now = this.clock.now();
    let changed = 0;
    for (const planId of planIds) {
      changed += await recalculateElementRollups(tx, planId, rules.config, now);
    }
    return changed;
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
    return loadActiveRules(tx);
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
