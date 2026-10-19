import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock/clock.js';
import { toIsoDate, toNumber } from '../../common/data/numbers.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { nextReference } from '../../domain/governance/decisions.js';
import { kpiPosition } from '../../domain/kpis/trajectory.js';
import { isDeliveredLowValue } from '../../domain/performance/benefits.js';
import {
  DEFAULT_RULESET_CONFIG,
  parseRulesetConfig,
  type RulesetConfig,
} from '../../domain/rulesets/ruleset-config.js';
import { STRATEGY_EDITOR_ROLES } from '../../domain/roles/roles.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Health, Trajectory } from '../../generated/prisma/enums.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import { HealthRecalculationService } from '../delivery/health-recalculation.service.js';
import { recalculateKpiPositions } from '../kpis/kpi-positions.js';
import { personSelect, toPersonRef } from '../people/person.js';
import {
  describeRulesetChanges,
  type PersonRef,
  type ProposeRulesetInput,
  type RulesetImpact,
  type RulesetsOverview,
  type RulesetView,
} from '@sims/contracts';

/** How long the MD/CEO has to decide a proposal before it shows as overdue. */
const DECISION_DUE_DAYS = 7;

const isOffice = (caller: AuthContext) =>
  caller.roles.some((r) =>
    (STRATEGY_EDITOR_ROLES as readonly string[]).includes(r),
  );

type RulesetRow = Prisma.RulesetGetPayload<object>;

/**
 * The organisation's rules, versioned and changed only by maker-checker:
 * the Strategy Office proposes (seeing the impact on today's portfolio
 * first), the MD/CEO approves or rejects through Decisions required, and an
 * approved version becomes active at once, with health and KPI trajectories
 * recalculated under it. Every version is kept.
 */
@Injectable()
export class RulesetsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly recalculation: HealthRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async overview(viewer: AuthContext): Promise<RulesetsOverview> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.ruleset.findMany({ orderBy: { version: 'desc' } });
      const people = await this.people(tx, rows);
      const decisions = await this.pendingDecisions(tx, rows);
      const active = rows.find((r) => r.status === 'ACTIVE');
      const activeConfig = active
        ? parseRulesetConfig(active.config)
        : DEFAULT_RULESET_CONFIG;

      // Each version's changes are described against the version before it;
      // a pending one against what is live now.
      const history = rows.map((row, i) => {
        const base =
          row.status === 'PENDING_APPROVAL'
            ? activeConfig
            : (() => {
                const older = rows
                  .slice(i + 1)
                  .find(
                    (r) => r.status === 'SUPERSEDED' || r.status === 'ACTIVE',
                  );
                return older ? parseRulesetConfig(older.config) : null;
              })();
        return this.toView(viewer, row, base, people, decisions);
      });
      const defaults: RulesetView = {
        id: null,
        version: null,
        status: 'ACTIVE',
        config: DEFAULT_RULESET_CONFIG,
        changeSummary: null,
        changes: [],
        proposedBy: null,
        approvedBy: null,
        effectiveFrom: null,
        createdAt: null,
        decisionId: null,
        can: { withdraw: false },
      };
      return {
        active: history.find((v) => v.status === 'ACTIVE') ?? defaults,
        pending: history.find((v) => v.status === 'PENDING_APPROVAL') ?? null,
        history,
        can: { propose: isOffice(viewer) },
      };
    });
  }

  /** What the proposed rules would change on today's portfolio. Saves nothing. */
  async preview(proposed: RulesetConfig): Promise<RulesetImpact> {
    return this.db.transaction(async (tx) => {
      const live = (await this.recalculation.loadActiveRules(tx)).config;
      const health = await this.recalculation.compareRules(tx, proposed);

      const kpis = await tx.kpi.findMany({
        orderBy: { code: 'asc' },
        include: { targets: { select: { targetDate: true, value: true } } },
      });
      const trajectory = (kpi: (typeof kpis)[number], config: RulesetConfig) =>
        kpiPosition(
          {
            direction: kpi.direction,
            baseline: toNumber(kpi.baseline),
            planTarget: toNumber(kpi.target),
            rangeLow: toNumber(kpi.rangeLow),
            rangeHigh: toNumber(kpi.rangeHigh),
            targets: kpi.targets.map((t) => ({
              targetDate: toIsoDate(t.targetDate),
              value: toNumber(t.value),
            })),
          },
          kpi.latestValue !== null && kpi.latestAt
            ? [
                {
                  value: toNumber(kpi.latestValue),
                  at: toIsoDate(kpi.latestAt),
                },
              ]
            : [],
          config.impact,
        ).trajectory;
      const kpiRows = kpis.map((k) => ({
        code: k.code,
        name: k.name,
        from: trajectory(k, live),
        to: trajectory(k, proposed),
      }));

      // Delivered but low value: closed work, plus active work that is Green.
      const impactOf = new Map(
        (
          await tx.initiative.findMany({
            where: {
              status: { in: ['ACTIVE', 'CLOSED'] },
              impactScore: { not: null },
            },
            select: { id: true, status: true, impactScore: true },
          })
        ).map((i) => [i.id, i]),
      );
      const lowValue = (config: RulesetConfig, side: 'live' | 'proposed') => {
        let count = 0;
        for (const i of impactOf.values()) {
          const row = health.find((h) => h.id === i.id);
          if (
            isDeliveredLowValue(
              {
                status: i.status,
                health: row ? row[side] : 'GREEN',
                impactScore: toNumber(i.impactScore),
              },
              config.impact.lowValueThresholdPct,
            )
          )
            count += 1;
        }
        return count;
      };

      return {
        changes: describeRulesetChanges(live, proposed),
        health: {
          initiatives: health.length,
          live: countBy(
            health.map((h) => h.live),
            HEALTHS,
          ),
          proposed: countBy(
            health.map((h) => h.proposed),
            HEALTHS,
          ),
          changes: health
            .filter((h) => h.live !== h.proposed)
            .map((h) => ({
              code: h.code,
              title: h.title,
              from: h.live,
              to: h.proposed,
            })),
        },
        kpis: {
          live: countBy(
            kpiRows.map((k) => k.from),
            TRAJECTORIES,
          ),
          proposed: countBy(
            kpiRows.map((k) => k.to),
            TRAJECTORIES,
          ),
          changes: kpiRows.filter((k) => k.from !== k.to),
        },
        lowValue: {
          live: lowValue(live, 'live'),
          proposed: lowValue(proposed, 'proposed'),
        },
      };
    });
  }

  /** Saves the next version as pending and asks the MD/CEO to decide. */
  async propose(
    caller: AuthContext,
    input: ProposeRulesetInput,
  ): Promise<RulesetView> {
    const id = uuidv7();
    await this.db.transaction(async (tx) => {
      const pending = await tx.ruleset.findFirst({
        where: { status: 'PENDING_APPROVAL' },
        select: { version: true },
      });
      if (pending) {
        throw new ConflictException({
          code: 'RULESET_PENDING',
          message: `Version ${pending.version} is already waiting for approval. Withdraw it, or wait for the decision.`,
        });
      }
      const live = (await this.recalculation.loadActiveRules(tx)).config;
      const changes = describeRulesetChanges(live, input.config);
      if (changes.length === 0) {
        throw new BadRequestException({
          code: 'NO_CHANGES',
          message: 'These are the rules already in force.',
        });
      }
      const latest = await tx.ruleset.aggregate({ _max: { version: true } });
      const version = (latest._max.version ?? 0) + 1;
      const { organisationId } = TenantContext.require();
      await tx.ruleset.create({
        data: {
          id,
          organisationId,
          version,
          status: 'PENDING_APPROVAL',
          config: input.config as unknown as Prisma.InputJsonValue,
          changeSummary: input.changeSummary,
          proposedById: caller.membershipId,
        },
      });

      const references = await tx.decision.findMany({
        where: { reference: { startsWith: 'RUL-' } },
        select: { reference: true },
      });
      const reference = nextReference(
        'RUL',
        references.map((r) => r.reference),
      );
      const approvalId = uuidv7();
      await tx.approval.create({
        data: {
          id: approvalId,
          organisationId,
          reference,
          type: 'RULESET_CHANGE',
          entityType: 'Ruleset',
          entityId: id,
          payload: { version, changes },
          justification: input.changeSummary,
          requestedById: caller.membershipId,
        },
      });
      const due = new Date(
        this.clock.now().getTime() + DECISION_DUE_DAYS * 86_400_000,
      );
      await tx.decision.create({
        data: {
          id: uuidv7(),
          organisationId,
          reference,
          title:
            `Approve rule change v${version}: ${input.changeSummary}`.slice(
              0,
              300,
            ),
          context: changes.join('\n'),
          requiredFrom: 'CEO',
          approvalId,
          dueDate: new Date(`${toIsoDate(due)}T00:00:00Z`),
        },
      });
      await recordAudit(tx, {
        action: 'RULESET_PROPOSED',
        entityType: 'Ruleset',
        entityId: id,
        after: {
          version,
          reference,
          changeSummary: input.changeSummary,
          changes,
        },
      });
    });
    return this.viewOf(caller, id);
  }

  /** The Strategy Office withdraws a proposal that has not been decided. */
  async withdraw(caller: AuthContext, rulesetId: string): Promise<RulesetView> {
    await this.db.transaction(async (tx) => {
      const row = await tx.ruleset.findUnique({ where: { id: rulesetId } });
      if (!row) throw rulesetNotFound();
      if (row.status !== 'PENDING_APPROVAL') {
        throw new ConflictException({
          code: 'RULESET_NOT_PENDING',
          message: `Version ${row.version} is not waiting for approval.`,
        });
      }
      const now = this.clock.now();
      await tx.ruleset.update({
        where: { id: rulesetId },
        data: { status: 'REJECTED' },
      });
      const approval = await tx.approval.findFirst({
        where: {
          entityType: 'Ruleset',
          entityId: rulesetId,
          status: 'PENDING',
        },
        include: { decision: true },
      });
      if (approval) {
        await tx.approval.update({
          where: { id: approval.id },
          data: {
            status: 'WITHDRAWN',
            decidedAt: now,
            decisionReason: 'Withdrawn by the Strategy Office',
          },
        });
        if (approval.decision)
          await tx.decision.update({
            where: { id: approval.decision.id },
            data: {
              outcome: 'REJECTED',
              outcomeNotes: 'Withdrawn by the Strategy Office',
              decidedById: caller.membershipId,
              decidedAt: now,
            },
          });
      }
      await recordAudit(tx, {
        action: 'RULESET_WITHDRAWN',
        entityType: 'Ruleset',
        entityId: rulesetId,
        after: { version: row.version },
      });
    });
    return this.viewOf(caller, rulesetId);
  }

  /**
   * The MD/CEO approved (called by Decisions inside its transaction): the
   * version becomes active and everything the rules drive is recalculated.
   */
  async apply(
    tx: TenantTransactionClient,
    approvalId: string,
    approverId: string,
    notes: string | undefined,
  ): Promise<void> {
    const approval = await tx.approval.findUniqueOrThrow({
      where: { id: approvalId },
    });
    const row = await tx.ruleset.findUniqueOrThrow({
      where: { id: approval.entityId },
    });
    if (row.status !== 'PENDING_APPROVAL') {
      throw new ConflictException({
        code: 'RULESET_NOT_PENDING',
        message: `Version ${row.version} is no longer waiting for approval.`,
      });
    }
    const now = this.clock.now();
    // One active version at a time (a unique index enforces it): retire the old one first.
    await tx.ruleset.updateMany({
      where: { status: 'ACTIVE' },
      data: { status: 'SUPERSEDED' },
    });
    await tx.ruleset.update({
      where: { id: row.id },
      data: { status: 'ACTIVE', approvedById: approverId, effectiveFrom: now },
    });
    await tx.approval.update({
      where: { id: approvalId },
      data: {
        status: 'APPROVED',
        reviewerId: approverId,
        decidedAt: now,
        decisionReason: notes ?? null,
      },
    });
    await recordAudit(tx, {
      action: 'RULESET_APPROVED',
      entityType: 'Ruleset',
      entityId: row.id,
      after: { version: row.version, notes },
    });

    // The new rules apply at once: health (and pillar rollups), then KPI trajectories.
    const config = parseRulesetConfig(row.config);
    const active = await tx.initiative.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    await this.recalculation.recalculateIn(
      tx,
      active.map((i) => i.id),
    );
    const kpis = await tx.kpi.findMany({ select: { id: true } });
    await recalculateKpiPositions(
      tx,
      kpis.map((k) => k.id),
      config,
    );
  }

  /** The MD/CEO rejected (called by Decisions inside its transaction). */
  async reject(
    tx: TenantTransactionClient,
    approvalId: string,
    approverId: string,
    notes: string | undefined,
  ): Promise<void> {
    const approval = await tx.approval.update({
      where: { id: approvalId },
      data: {
        status: 'REJECTED',
        reviewerId: approverId,
        decidedAt: this.clock.now(),
        decisionReason: notes ?? null,
      },
    });
    await tx.ruleset.update({
      where: { id: approval.entityId },
      data: { status: 'REJECTED' },
    });
    await recordAudit(tx, {
      action: 'RULESET_REJECTED',
      entityType: 'Ruleset',
      entityId: approval.entityId,
      after: { reference: approval.reference, notes },
    });
  }

  // ---------------------------------------------------------------------------

  private async viewOf(
    viewer: AuthContext,
    rulesetId: string,
  ): Promise<RulesetView> {
    const overview = await this.overview(viewer);
    const view = overview.history.find((v) => v.id === rulesetId);
    if (!view) throw rulesetNotFound();
    return view;
  }

  private toView(
    viewer: AuthContext,
    row: RulesetRow,
    base: RulesetConfig | null,
    people: Map<string, PersonRef>,
    decisions: Map<string, string>,
  ): RulesetView {
    const config = parseRulesetConfig(row.config);
    return {
      id: row.id,
      version: row.version,
      status: row.status,
      config,
      changeSummary: row.changeSummary,
      changes: base ? describeRulesetChanges(base, config) : [],
      proposedBy: (row.proposedById && people.get(row.proposedById)) || null,
      approvedBy: (row.approvedById && people.get(row.approvedById)) || null,
      effectiveFrom: row.effectiveFrom?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      decisionId: decisions.get(row.id) ?? null,
      can: { withdraw: row.status === 'PENDING_APPROVAL' && isOffice(viewer) },
    };
  }

  private async people(tx: TenantTransactionClient, rows: RulesetRow[]) {
    const ids = [
      ...new Set(
        rows
          .flatMap((r) => [r.proposedById, r.approvedById])
          .filter((id): id is string => !!id),
      ),
    ];
    const members = await tx.membership.findMany({
      where: { id: { in: ids } },
      ...personSelect,
    });
    return new Map(members.map((m) => [m.id, toPersonRef(m)!]));
  }

  /** Ruleset id → its open decision id. */
  private async pendingDecisions(
    tx: TenantTransactionClient,
    rows: RulesetRow[],
  ) {
    const pending = rows
      .filter((r) => r.status === 'PENDING_APPROVAL')
      .map((r) => r.id);
    if (pending.length === 0) return new Map<string, string>();
    const approvals = await tx.approval.findMany({
      where: {
        entityType: 'Ruleset',
        entityId: { in: pending },
        status: 'PENDING',
      },
      select: { entityId: true, decision: { select: { id: true } } },
    });
    return new Map(
      approvals
        .filter((a) => a.decision)
        .map((a) => [a.entityId, a.decision!.id]),
    );
  }
}

const HEALTHS = [
  'GREEN',
  'AMBER',
  'RED',
  'UNKNOWN',
] as const satisfies readonly Health[];
const TRAJECTORIES = [
  'ON_TRAJECTORY',
  'SLIGHTLY_BEHIND',
  'OFF_TRAJECTORY',
  'NOT_MEASURABLE',
] as const satisfies readonly Trajectory[];

function countBy<K extends string>(
  values: K[],
  keys: readonly K[],
): Record<K, number> {
  const counts = Object.fromEntries(keys.map((k) => [k, 0])) as Record<
    K,
    number
  >;
  for (const v of values) counts[v] += 1;
  return counts;
}

const rulesetNotFound = () =>
  new NotFoundException({
    code: 'RULESET_NOT_FOUND',
    message: 'Ruleset not found.',
  });
