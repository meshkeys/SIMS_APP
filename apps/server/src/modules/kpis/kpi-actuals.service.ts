import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { toIsoDate, toNumber } from '../../common/data/numbers.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { STRATEGY_EDITOR_ROLES } from '../../domain/roles/roles.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import {
  loadActiveRules,
  recalculateElementRollups,
} from '../delivery/element-rollups.js';
import { personSelect, toPersonRef } from '../people/person.js';
import { periodNotFound } from '../reporting/periods.service.js';
import { recalculateKpiPositions } from './kpi-positions.js';
import { topLevelResolver } from './kpi-view.js';
import type {
  KpiActualRow,
  KpiActualsSheet,
  PersonRef,
  RecordKpiActualsInput,
  VerifyKpiActualsInput,
} from '@sims/contracts';

const isOffice = (caller: AuthContext) =>
  caller.roles.some((role) =>
    (STRATEGY_EDITOR_ROLES as readonly string[]).includes(role),
  );

/**
 * KPI readings per reporting period. KPI owners record their own KPIs;
 * the Strategy Office records any KPI (verified as it is saved) and verifies
 * what owners recorded. Only verified readings move a KPI's latest value and
 * trajectory, and with them the impact scores up the strategy tree.
 */
@Injectable()
export class KpiActualsService {
  constructor(
    private readonly db: TenantPrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async sheet(viewer: AuthContext, periodId: string): Promise<KpiActualsSheet> {
    return this.db.transaction(async (tx) => {
      const period = await this.findPeriod(tx, periodId);
      const elements = await tx.strategyElement.findMany({
        where: { planId: period.planId },
        select: { id: true, code: true, title: true, parentId: true },
      });
      const kpis = await tx.kpi.findMany({
        where: { element: { planId: period.planId } },
        orderBy: { code: 'asc' },
        include: {
          owner: personSelect,
          targets: { orderBy: { targetDate: 'asc' } },
          actuals: {
            where: {
              OR: [
                { periodId },
                {
                  verifiedAt: { not: null },
                  period: { endDate: { lt: period.endDate } },
                },
              ],
            },
            include: { period: { select: { name: true, endDate: true } } },
          },
        },
      });

      // Readings store who recorded and verified them as plain ids.
      const peopleIds = new Set<string>();
      for (const kpi of kpis)
        for (const actual of kpi.actuals) {
          if (actual.periodId !== periodId) continue;
          if (actual.submittedById) peopleIds.add(actual.submittedById);
          if (actual.verifiedById) peopleIds.add(actual.verifiedById);
        }
      const people = new Map<string, PersonRef>(
        (
          await tx.membership.findMany({
            where: { id: { in: [...peopleIds] } },
            ...personSelect,
          })
        ).map((m) => [m.id, toPersonRef(m)!]),
      );
      const person = (id: string | null) =>
        (id ? people.get(id) : undefined) ?? null;

      const open = period.status !== 'LOCKED';
      const office = isOffice(viewer);
      const topLevelOf = topLevelResolver(elements);
      const periodEnd = toIsoDate(period.endDate);

      const rows = kpis.map((kpi): KpiActualRow => {
        const current = kpi.actuals.find((a) => a.periodId === periodId);
        const previous = kpi.actuals
          .filter((a) => a.periodId !== periodId)
          .sort(
            (a, b) => b.period.endDate.getTime() - a.period.endDate.getTime(),
          )[0];
        const due =
          kpi.targets.find((t) => toIsoDate(t.targetDate) >= periodEnd) ?? null;
        const verified = !!current?.verifiedAt;
        return {
          kpi: {
            id: kpi.id,
            code: kpi.code,
            name: kpi.name,
            unit: kpi.unit,
            direction: kpi.direction,
          },
          topLevel: topLevelOf(kpi.elementId),
          owner: toPersonRef(kpi.owner),
          baseline: toNumber(kpi.baseline),
          target: due ? toNumber(due.value) : toNumber(kpi.target),
          targetLabel: due?.label ?? null,
          previous: previous
            ? { period: previous.period.name, value: toNumber(previous.value) }
            : null,
          actual: current
            ? {
                value: toNumber(current.value),
                commentary: current.commentary,
                verified,
                recordedBy: person(current.submittedById),
                verifiedBy: person(current.verifiedById),
              }
            : null,
          can: {
            record:
              open &&
              (office || (kpi.ownerId === viewer.membershipId && !verified)),
            verify: open && office && !!current && !verified,
          },
        };
      });

      return {
        period: {
          id: period.id,
          name: period.name,
          endDate: periodEnd,
          status: period.status,
        },
        rows,
        counts: {
          kpis: rows.length,
          recorded: rows.filter((r) => r.actual).length,
          verified: rows.filter((r) => r.actual?.verified).length,
        },
        open,
      };
    });
  }

  async record(
    viewer: AuthContext,
    periodId: string,
    input: RecordKpiActualsInput,
  ): Promise<KpiActualsSheet> {
    await this.db.transaction(async (tx) => {
      const period = await this.openPeriod(tx, periodId);
      const ids = input.actuals.map((a) => a.kpiId);
      const kpis = await tx.kpi.findMany({
        where: { id: { in: ids }, element: { planId: period.planId } },
        select: {
          id: true,
          code: true,
          ownerId: true,
          actuals: {
            where: { periodId },
            select: { id: true, verifiedAt: true },
          },
        },
      });
      const byId = new Map(kpis.map((kpi) => [kpi.id, kpi]));

      const seen = new Set<string>();
      const errors = input.actuals.flatMap((actual, index) => {
        const problem = !byId.has(actual.kpiId)
          ? 'Choose a KPI of this plan'
          : seen.has(actual.kpiId)
            ? 'Each KPI can appear once'
            : null;
        seen.add(actual.kpiId);
        return problem
          ? [
              {
                path: `actuals.${index}.kpiId`,
                message: problem,
                code: 'custom',
              },
            ]
          : [];
      });
      if (errors.length) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Some fields are missing or invalid.',
          errors,
        });
      }

      const office = isOffice(viewer);
      if (!office) {
        const notOwned = kpis.filter((k) => k.ownerId !== viewer.membershipId);
        if (notOwned.length) {
          throw new ForbiddenException({
            code: 'NOT_KPI_OWNER',
            message: `You can record actuals only for KPIs you own (not ${codes(notOwned)}).`,
          });
        }
        const locked = kpis.filter((k) => k.actuals[0]?.verifiedAt);
        if (locked.length) {
          throw new ConflictException({
            code: 'KPI_ACTUAL_VERIFIED',
            message: `The ${period.name} reading for ${codes(locked)} is already verified. Ask the Strategy Office to correct it.`,
          });
        }
      }

      const { organisationId } = TenantContext.require();
      const now = this.clock.now();
      for (const actual of input.actuals) {
        const verification = office
          ? { verifiedById: viewer.membershipId, verifiedAt: now }
          : { verifiedById: null, verifiedAt: null };
        await tx.kpiActual.upsert({
          where: { kpiId_periodId: { kpiId: actual.kpiId, periodId } },
          create: {
            id: uuidv7(),
            organisationId,
            kpiId: actual.kpiId,
            periodId,
            value: actual.value,
            commentary: actual.commentary,
            submittedById: viewer.membershipId,
            ...verification,
          },
          update: {
            value: actual.value,
            commentary: actual.commentary,
            submittedById: viewer.membershipId,
            ...verification,
          },
        });
      }
      await recordAudit(tx, {
        action: 'KPI_ACTUALS_RECORDED',
        entityType: 'ReportingPeriod',
        entityId: periodId,
        after: {
          verified: office,
          actuals: input.actuals.map((a) => ({
            kpi: byId.get(a.kpiId)!.code,
            value: a.value,
          })),
        },
      });
      // Owners' readings only count once verified; the Office's count at once.
      if (office) await this.recalculate(tx, period.planId, ids);
    });
    return this.sheet(viewer, periodId);
  }

  async verify(
    viewer: AuthContext,
    periodId: string,
    input: VerifyKpiActualsInput,
  ): Promise<KpiActualsSheet> {
    await this.db.transaction(async (tx) => {
      const period = await this.openPeriod(tx, periodId);
      const kpis = await tx.kpi.findMany({
        where: {
          id: { in: input.kpiIds },
          element: { planId: period.planId },
        },
        select: {
          id: true,
          code: true,
          actuals: {
            where: { periodId },
            select: { id: true, verifiedAt: true },
          },
        },
      });
      const missing = kpis.filter((k) => k.actuals.length === 0);
      if (kpis.length < new Set(input.kpiIds).size || missing.length) {
        throw new ConflictException({
          code: 'KPI_ACTUAL_MISSING',
          message: missing.length
            ? `${codes(missing)} has no ${period.name} reading to verify yet.`
            : 'Some KPIs are not part of this plan.',
        });
      }

      // Already-verified readings are left as they are.
      const toVerify = kpis.filter((k) => !k.actuals[0]!.verifiedAt);
      if (toVerify.length === 0) return;
      await tx.kpiActual.updateMany({
        where: { id: { in: toVerify.map((k) => k.actuals[0]!.id) } },
        data: {
          verifiedById: viewer.membershipId,
          verifiedAt: this.clock.now(),
        },
      });
      await recordAudit(tx, {
        action: 'KPI_ACTUALS_VERIFIED',
        entityType: 'ReportingPeriod',
        entityId: periodId,
        after: { kpis: toVerify.map((k) => k.code) },
      });
      await this.recalculate(
        tx,
        period.planId,
        toVerify.map((k) => k.id),
      );
    });
    return this.sheet(viewer, periodId);
  }

  // ---------------------------------------------------------------------------

  private async findPeriod(tx: TenantTransactionClient, periodId: string) {
    const period = await tx.reportingPeriod.findUnique({
      where: { id: periodId },
    });
    if (!period) throw periodNotFound();
    return period;
  }

  private async openPeriod(tx: TenantTransactionClient, periodId: string) {
    const period = await this.findPeriod(tx, periodId);
    if (period.status === 'LOCKED') {
      throw new ConflictException({
        code: 'PERIOD_LOCKED',
        message: `${period.name} is locked; its KPI readings are part of the record.`,
      });
    }
    return period;
  }

  /** New verified readings move KPI positions, then the impact rollups. */
  private async recalculate(
    tx: TenantTransactionClient,
    planId: string,
    kpiIds: string[],
  ) {
    const rules = await loadActiveRules(tx);
    await recalculateKpiPositions(tx, kpiIds, rules.config);
    await recalculateElementRollups(tx, planId, rules.config, this.clock.now());
  }
}

const codes = (kpis: { code: string }[]) =>
  kpis
    .map((k) => k.code)
    .sort()
    .join(', ');
