import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { toIsoDate, toNumber } from '../../common/data/numbers.js';
import { isUniqueViolation } from '../../common/data/prisma-errors.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { effectiveHealth } from '../../domain/delivery/health.js';
import { cycleDay, cycleDeadlines } from '../../domain/reporting/calendar.js';
import {
  owesUpdate,
  SUBMITTED_STATUSES,
} from '../../domain/reporting/obligations.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  PeriodStatus,
  UpdateStatus,
} from '../../generated/prisma/enums.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import { HealthRecalculationService } from '../delivery/health-recalculation.service.js';
import { PlansService } from '../strategy/plans.service.js';
import type { LockPeriodInput, OpenPeriodInput } from './reporting.schemas.js';

export interface PeriodSummary {
  id: string;
  name: string;
  status: PeriodStatus;
  startDate: string;
  endDate: string;
  deadlines: {
    submissionOpensAt: string | null;
    submissionDueAt: string | null;
    strategyReviewDueAt: string | null;
    sponsorReviewDueAt: string | null;
    reportIssueDueAt: string | null;
  };
  lockedAt: string | null;
  /** "Day 6 of 8" while the cycle runs. */
  cycleDay: { day: number; of: number } | null;
  /** The cycle tracker: "29 of 32 in · 6 challenged · 3 pending". */
  counts: {
    owed: number;
    in: number;
    outstanding: number;
    drafts: number;
    awaitingVerification: number;
    challenged: number;
    awaitingSponsor: number;
    approved: number;
  };
}

/** Stages in order; locking is a separate, checked step. */
const NEXT_STAGE: Partial<Record<PeriodStatus, PeriodStatus>> = {
  OPEN: 'OWNER_SUBMISSION',
  OWNER_SUBMISSION: 'STRATEGY_REVIEW',
  STRATEGY_REVIEW: 'SPONSOR_REVIEW',
};

export const periodNotFound = () =>
  new NotFoundException({
    code: 'PERIOD_NOT_FOUND',
    message: 'Reporting period not found.',
  });

@Injectable()
export class PeriodsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly plans: PlansService,
    private readonly recalculation: HealthRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(planId?: string): Promise<PeriodSummary[]> {
    const plan = planId ?? (await this.plans.currentPlanId());
    const periods = await this.db.client.reportingPeriod.findMany({
      where: { planId: plan },
      orderBy: { startDate: 'desc' },
    });
    return this.db.transaction((tx) =>
      Promise.all(periods.map((p) => this.summarise(tx, p))),
    );
  }

  /** The period in progress (not yet locked), or null between cycles. */
  async current(): Promise<PeriodSummary | null> {
    const planId = await this.plans.currentPlanId();
    const period = await this.db.client.reportingPeriod.findFirst({
      where: { planId, status: { not: 'LOCKED' } },
      orderBy: { startDate: 'desc' },
    });
    return period
      ? this.db.transaction((tx) => this.summarise(tx, period))
      : null;
  }

  async get(periodId: string): Promise<PeriodSummary> {
    const period = await this.db.client.reportingPeriod.findUnique({
      where: { id: periodId },
    });
    if (!period) throw periodNotFound();
    return this.db.transaction((tx) => this.summarise(tx, period));
  }

  /**
   * Opens the next cycle. Deadlines come from the active ruleset in working
   * days from `opensOn`, closing at 17:00 in the organisation's time zone, and
   * are stored on the period so later rule changes never move a live cycle.
   */
  async open(input: OpenPeriodInput): Promise<PeriodSummary> {
    const planId = input.planId ?? (await this.plans.currentPlanId());
    const id = uuidv7();
    try {
      await this.db.transaction(async (tx) => {
        await this.plans.assertPlanExists(planId, tx);
        const running = await tx.reportingPeriod.findFirst({
          where: { planId, status: { not: 'LOCKED' } },
          select: { name: true },
        });
        if (running) {
          throw new ConflictException({
            code: 'PERIOD_IN_PROGRESS',
            message: `${running.name} is still in progress. Lock it before opening the next cycle.`,
          });
        }
        const [rules, organisation] = await Promise.all([
          this.recalculation.loadActiveRules(tx),
          tx.organisation.findFirstOrThrow({ select: { timezone: true } }),
        ]);
        const deadlines = cycleDeadlines(
          input.opensOn,
          rules.config.reportingCycle,
          organisation.timezone,
        );
        await tx.reportingPeriod.create({
          data: {
            id,
            organisationId: TenantContext.require().organisationId,
            planId,
            name: input.name,
            startDate: new Date(`${input.startDate}T00:00:00Z`),
            endDate: new Date(`${input.endDate}T00:00:00Z`),
            status: 'OWNER_SUBMISSION',
            ...deadlines,
          },
        });
        await recordAudit(tx, {
          action: 'PERIOD_OPENED',
          entityType: 'ReportingPeriod',
          entityId: id,
          after: {
            name: input.name,
            submissionDueAt: deadlines.submissionDueAt.toISOString(),
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error, 'name')) {
        throw new ConflictException({
          code: 'PERIOD_EXISTS',
          message: `A period named ${input.name} already exists.`,
        });
      }
      throw error;
    }
    return this.get(id);
  }

  /** Moves the cycle to its next stage (submission → Strategy Office review → sponsor review). */
  async advance(periodId: string): Promise<PeriodSummary> {
    await this.db.transaction(async (tx) => {
      const period = await tx.reportingPeriod.findUnique({
        where: { id: periodId },
      });
      if (!period) throw periodNotFound();
      const next = NEXT_STAGE[period.status];
      if (!next) {
        throw new ConflictException({
          code: period.status === 'LOCKED' ? 'PERIOD_LOCKED' : 'READY_TO_LOCK',
          message:
            period.status === 'LOCKED'
              ? 'This period is locked.'
              : 'Sponsor review is the last stage: lock the period to issue the report.',
        });
      }
      await tx.reportingPeriod.update({
        where: { id: periodId },
        data: { status: next },
      });
      await recordAudit(tx, {
        action: 'PERIOD_ADVANCED',
        entityType: 'ReportingPeriod',
        entityId: periodId,
        before: { status: period.status },
        after: { status: next },
      });
    });
    return this.get(periodId);
  }

  /**
   * Freezes the period: no more edits, progress snapshots for every active
   * initiative, health recalculated (unreported initiatives become Unknown),
   * and a report snapshot that Board packs are built from.
   */
  async lock(periodId: string, input: LockPeriodInput): Promise<PeriodSummary> {
    await this.db.transaction(
      async (tx) => {
        const period = await tx.reportingPeriod.findUnique({
          where: { id: periodId },
        });
        if (!period) throw periodNotFound();
        if (period.status === 'LOCKED') {
          throw new ConflictException({
            code: 'PERIOD_LOCKED',
            message: 'This period is already locked.',
          });
        }
        if (period.status !== 'SPONSOR_REVIEW') {
          throw new ConflictException({
            code: 'NOT_READY_TO_LOCK',
            message: 'Advance the cycle to sponsor review before locking.',
          });
        }

        const pending = await tx.statusUpdate.findMany({
          where: {
            periodId,
            status: { in: ['SUBMITTED', 'CHALLENGED', 'REVIEWED'] },
          },
          select: {
            id: true,
            status: true,
            initiative: { select: { code: true } },
          },
        });
        const unresolved = pending.filter(
          (u) => u.status !== 'REVIEWED' || !input.approveAwaitingSponsor,
        );
        if (unresolved.length) {
          throw new ConflictException({
            code: 'UPDATES_PENDING',
            message:
              'Some updates are not finished. Verify, resolve challenges, or approve awaiting sponsor confirmation.',
            errors: unresolved.map((u) => ({
              path: u.initiative.code,
              message: STATUS_WORDS[u.status],
              code: u.status,
            })),
          });
        }

        const now = this.clock.now();
        for (const update of pending) {
          await tx.statusUpdate.update({
            where: { id: update.id },
            data: { status: 'APPROVED', approvedAt: now },
          });
          await recordAudit(tx, {
            action: 'UPDATE_APPROVED',
            entityType: 'StatusUpdate',
            entityId: update.id,
            after: { approvedAtLock: true },
          });
        }
        await tx.reportingPeriod.update({
          where: { id: periodId },
          data: { status: 'LOCKED', lockedAt: now },
        });
        // With the period locked, unreported initiatives now turn Unknown.
        await this.recalculation.recalculateIn(
          tx,
          (
            await tx.initiative.findMany({
              where: { planId: period.planId, status: 'ACTIVE' },
              select: { id: true },
            })
          ).map((i) => i.id),
        );
        await this.snapshot(tx, period, now);
        await recordAudit(tx, {
          action: 'PERIOD_LOCKED',
          entityType: 'ReportingPeriod',
          entityId: periodId,
          after: { autoApproved: pending.length },
        });
      },
      { timeout: 60_000 },
    );
    return this.get(periodId);
  }

  // ---------------------------------------------------------------------------

  private async snapshot(
    tx: TenantTransactionClient,
    period: { id: string; planId: string; name: string },
    now: Date,
  ) {
    const { organisationId, membershipId } = TenantContext.require();
    const initiatives = await tx.initiative.findMany({
      where: { planId: period.planId, status: { in: ['ACTIVE', 'ON_HOLD'] } },
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
        objectiveLinks: {
          where: { isPrimary: true },
          select: { elementId: true },
        },
      },
    });
    const asOf = new Date(`${toIsoDate(now)}T00:00:00Z`);
    for (const i of initiatives) {
      const health = effectiveHealth(i, now).health;
      await tx.progressSnapshot.upsert({
        where: { initiativeId_asOf: { initiativeId: i.id, asOf } },
        create: {
          id: uuidv7(),
          organisationId,
          initiativeId: i.id,
          periodId: period.id,
          asOf,
          plannedProgress: i.plannedProgress,
          verifiedProgress: i.verifiedProgress,
          health,
          impactScore: i.impactScore,
        },
        update: {
          periodId: period.id,
          plannedProgress: i.plannedProgress,
          verifiedProgress: i.verifiedProgress,
          health,
          impactScore: i.impactScore,
        },
      });
    }
    const byHealth = { GREEN: 0, AMBER: 0, RED: 0, UNKNOWN: 0 };
    const rows = initiatives.map((i) => {
      const health = effectiveHealth(i, now);
      byHealth[health.health] += 1;
      return {
        initiativeId: i.id,
        code: i.code,
        title: i.title,
        status: i.status,
        isSensitive: i.isSensitive,
        homeElementId: i.objectiveLinks[0]?.elementId ?? null,
        health: health.health,
        calculatedHealth: i.calculatedHealth,
        overridden: health.overridden,
        verifiedProgress: toNumber(i.verifiedProgress),
        plannedProgress: toNumber(i.plannedProgress),
        impactScore: toNumber(i.impactScore),
        impactSummary: i.impactSummary,
      };
    });
    await tx.reportSnapshot.create({
      data: {
        id: uuidv7(),
        organisationId,
        periodId: period.id,
        kind: 'PERIOD_LOCK',
        createdById: membershipId ?? null,
        data: {
          period: period.name,
          lockedAt: now.toISOString(),
          totals: { initiatives: rows.length, byHealth },
          initiatives: rows,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private async summarise(
    tx: TenantTransactionClient,
    period: {
      id: string;
      planId: string;
      name: string;
      status: PeriodStatus;
      startDate: Date;
      endDate: Date;
      submissionOpensAt: Date | null;
      submissionDueAt: Date | null;
      strategyReviewDueAt: Date | null;
      sponsorReviewDueAt: Date | null;
      reportIssueDueAt: Date | null;
      lockedAt: Date | null;
    },
  ): Promise<PeriodSummary> {
    const [initiatives, updates, rules, organisation] = await Promise.all([
      tx.initiative.findMany({
        where: {
          planId: period.planId,
          status: { in: ['ACTIVE', 'ON_HOLD', 'CLOSED'] },
        },
        select: {
          id: true,
          activatedAt: true,
          baselineStart: true,
          status: true,
          actualEnd: true,
        },
      }),
      tx.statusUpdate.groupBy({
        by: ['status'],
        where: { periodId: period.id },
        _count: { _all: true },
      }),
      this.recalculation.loadActiveRules(tx),
      tx.organisation.findFirstOrThrow({ select: { timezone: true } }),
    ]);
    // Closed initiatives owed the period only if they were still open at its end.
    const owed = initiatives.filter(
      (i) =>
        owesUpdate(i, period) &&
        (i.status !== 'CLOSED' ||
          (i.actualEnd !== null && i.actualEnd >= period.endDate)),
    ).length;
    const count = (status: UpdateStatus) =>
      updates.find((u) => u.status === status)?._count._all ?? 0;
    const submittedIn = SUBMITTED_STATUSES.reduce(
      (sum, status) => sum + count(status),
      0,
    );
    const totalDays = rules.config.reportingCycle.reportIssueDay;

    return {
      id: period.id,
      name: period.name,
      status: period.status,
      startDate: toIsoDate(period.startDate),
      endDate: toIsoDate(period.endDate),
      deadlines: {
        submissionOpensAt: period.submissionOpensAt?.toISOString() ?? null,
        submissionDueAt: period.submissionDueAt?.toISOString() ?? null,
        strategyReviewDueAt: period.strategyReviewDueAt?.toISOString() ?? null,
        sponsorReviewDueAt: period.sponsorReviewDueAt?.toISOString() ?? null,
        reportIssueDueAt: period.reportIssueDueAt?.toISOString() ?? null,
      },
      lockedAt: period.lockedAt?.toISOString() ?? null,
      cycleDay:
        period.status !== 'LOCKED' && period.submissionOpensAt
          ? {
              day: cycleDay(
                this.clock.now(),
                period.submissionOpensAt,
                totalDays,
                organisation.timezone,
              ),
              of: totalDays,
            }
          : null,
      counts: {
        owed,
        in: submittedIn,
        outstanding: Math.max(0, owed - submittedIn),
        drafts: count('DRAFT'),
        awaitingVerification: count('SUBMITTED'),
        challenged: count('CHALLENGED'),
        awaitingSponsor: count('REVIEWED'),
        approved: count('APPROVED'),
      },
    };
  }
}

const STATUS_WORDS: Record<string, string> = {
  SUBMITTED: 'Submitted, awaiting Strategy Office verification',
  CHALLENGED: 'Challenged, awaiting the owner’s resubmission',
  REVIEWED: 'Verified, awaiting sponsor confirmation',
};
