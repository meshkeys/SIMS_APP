import type {
  Prisma,
  PrismaClient,
} from '../../../src/generated/prisma/client.js';
import type { Trajectory } from '../../../src/generated/prisma/enums.js';
import {
  DEFAULT_RULESET_CONFIG,
  parseRulesetConfig,
  type RulesetConfig,
} from '../../../src/domain/rulesets/ruleset-config.js';
import {
  autoSteps,
  startLevel,
} from '../../../src/domain/governance/escalation-ladder.js';
import { recalculateElementRollups } from '../../../src/modules/delivery/element-rollups.js';
import { recalculateKpiPositions } from '../../../src/modules/kpis/kpi-positions.js';
import { captureReportSnapshot } from '../../../src/modules/reporting/report-snapshot.js';
import {
  DIG_004_BENEFIT,
  MILLION,
  PORTFOLIO_EXPECTED,
  PORTFOLIO_Q4_FORECAST,
  PORTFOLIO_REALISED,
  QUARTERS,
  SHARED_BENEFITS,
} from './benefits.js';
import {
  DECISIONS,
  DEPENDENCIES,
  ESCALATIONS,
  ISSUES,
  NAMED_RISKS,
  RISK_HEATMAP,
  RISK_TITLES,
  severityFor,
  type EscalationSpec,
} from './governance.js';
import {
  ACTIVE_INITIATIVES,
  ALL_INITIATIVES,
  OCTOBER_UPDATE_STATE,
  type InitiativeSpec,
} from './initiatives.js';
import {
  addDays,
  allocate,
  AS_OF,
  atTime,
  date,
  daysAgo,
  endOfMonth,
  uuidv7,
} from './lib.js';
import { hashPassword } from '../../../src/modules/auth/passwords.js';
import {
  type ComputedDelivery,
  computeDelivery,
  deliveryProblems,
} from './delivery.js';
import {
  DEMO_ORG,
  DEMO_PASSWORD,
  DEPARTMENTS,
  emailFor,
  PEOPLE,
  type DepartmentKey,
  type PersonKey,
} from './people.js';
import {
  KPI_ACTUAL_MONTHS,
  KPIS,
  LEVELS,
  OBJECTIVES,
  PILLARS,
  PLAN,
} from './strategy.js';

type Tx = Prisma.TransactionClient;

export interface SeedSummary {
  organisationId: string;
  organisationSlug: string;
  users: number;
  initiatives: number;
  milestones: number;
  kpis: number;
  risks: number;
  escalations: number;
  decisions: number;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
] as const;

const trajectoryFor = (impact: number | null): Trajectory =>
  impact === null
    ? 'NOT_MEASURABLE'
    : impact >= 60
      ? 'ON_TRAJECTORY'
      : impact >= 40
        ? 'SLIGHTLY_BEHIND'
        : 'OFF_TRAJECTORY';

type Computed = Map<string, ComputedDelivery>;

/** Share of the way from start to today, for back-filled history. */
function progressAt(spec: InitiativeSpec, start: Date, at: Date) {
  const startMs = start.getTime();
  const f = Math.min(
    1,
    Math.max(0, (at.getTime() - startMs) / (AS_OF.getTime() - startMs)),
  );
  return {
    planned: Math.round(spec.planned * f * 100) / 100,
    verified: Math.round(spec.progress * f ** 1.15 * 100) / 100,
  };
}

/** Fails fast on inconsistent demo data before touching the database. */
function validateSpecs(ruleset: RulesetConfig, computed: Computed): void {
  const problems: string[] = [];
  const codes = new Set<string>();
  const objectiveCodes = new Set(OBJECTIVES.map((o) => o.code));

  for (const spec of ALL_INITIATIVES) {
    if (codes.has(spec.code))
      problems.push(`duplicate initiative ${spec.code}`);
    codes.add(spec.code);
    for (const objective of [
      spec.objective,
      ...(spec.alsoContributesTo ?? []).map((l) => l.objective),
    ]) {
      if (!objectiveCodes.has(objective))
        problems.push(`${spec.code}: unknown objective ${objective}`);
    }
    problems.push(...deliveryProblems(spec, computed.get(spec.code)!));
  }
  for (const [key, person] of Object.entries(PEOPLE)) {
    const manager = (person as { manager?: string }).manager;
    if (manager && !(manager in PEOPLE))
      problems.push(`${key}: unknown manager ${manager}`);
  }
  for (const spec of ESCALATIONS) {
    if (!codes.has(spec.initiative))
      problems.push(`escalation: unknown initiative ${spec.initiative}`);
    const history = escalationHistory(spec, ruleset);
    if (history.at(-1)!.level !== spec.level) {
      problems.push(
        `escalation "${spec.title}": ladder timings put it at L${history.at(-1)!.level}, spec says L${spec.level}`,
      );
    }
  }
  if (problems.length)
    throw new Error(
      `Demo seed data is inconsistent:\n  - ${problems.join('\n  - ')}`,
    );
}

/** Replays the ruleset's ladder timings (the API's own rules) to produce an escalation's level history. */
function escalationHistory(spec: EscalationSpec, ruleset: RulesetConfig) {
  const DAY_MS = 86_400_000;
  const origin = new Date(0);
  const start = startLevel(spec.severity, ruleset.escalation);
  const age = spec.resolved ? spec.resolved.afterDays : spec.ageDays;
  return [
    { level: start.level, afterDays: 0, reason: start.reason },
    ...autoSteps(
      { level: start.level, levelChangedAt: origin },
      ruleset.escalation,
      new Date(age * DAY_MS),
    ).map((step) => ({
      level: step.level,
      afterDays: Math.round(step.dueAt.getTime() / DAY_MS),
      reason: 'AUTO_TIMEOUT' as const,
    })),
  ];
}

/**
 * Creates (or recreates) the Meridian demo organisation.
 * Runs in one transaction: it either fully succeeds or changes nothing.
 * Must run as the table owner / a superuser (bypasses row-level security).
 */
export async function seedDemo(prisma: PrismaClient): Promise<SeedSummary> {
  const ruleset = parseRulesetConfig(DEFAULT_RULESET_CONFIG);
  // Health and planned progress come from the real rules engine, and must
  // reproduce the wireframes exactly or the seed refuses to run.
  const computed: Computed = new Map(
    ALL_INITIATIVES.map((spec) => [spec.code, computeDelivery(spec, ruleset)]),
  );
  validateSpecs(ruleset, computed);
  // One hash for every demo user: Argon2 is deliberately slow.
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  return prisma.$transaction(
    (tx) => writeDemo(tx, ruleset, passwordHash, computed),
    {
      maxWait: 10_000,
      timeout: 120_000,
    },
  );
}

async function writeDemo(
  tx: Tx,
  ruleset: RulesetConfig,
  passwordHash: string,
  computed: Computed,
): Promise<SeedSummary> {
  // ----------------------------------------------------------- reset
  await tx.organisation.deleteMany({ where: { slug: DEMO_ORG.slug } });
  await tx.user.deleteMany({
    where: { email: { endsWith: `@${DEMO_ORG.emailDomain}` } },
  });

  // ----------------------------------------------------------- tenant
  const organisationId = uuidv7();
  const org = { organisationId };
  await tx.organisation.create({
    data: {
      id: organisationId,
      name: DEMO_ORG.name,
      slug: DEMO_ORG.slug,
      sector: 'PRIVATE',
      country: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      status: 'ACTIVE',
      onboardingStep: 5,
      subscription: {
        create: {
          plan: 'ENTERPRISE',
          status: 'ACTIVE',
          seats: 200,
          renewsAt: date('2027-01-31'),
        },
      },
    },
  });

  // ----------------------------------------------------------- people
  const departmentIds = Object.fromEntries(
    Object.keys(DEPARTMENTS).map((key) => [key, uuidv7()]),
  ) as Record<DepartmentKey, string>;
  await tx.department.createMany({
    data: Object.entries(DEPARTMENTS).map(([key, name]) => ({
      id: departmentIds[key as DepartmentKey],
      ...org,
      name,
    })),
  });

  const personKeys = Object.keys(PEOPLE) as PersonKey[];
  const userIds = Object.fromEntries(
    personKeys.map((k) => [k, uuidv7()]),
  ) as Record<PersonKey, string>;
  const member = Object.fromEntries(
    personKeys.map((k) => [k, uuidv7()]),
  ) as Record<PersonKey, string>;
  await tx.user.createMany({
    data: personKeys.map((key) => ({
      id: userIds[key],
      email: emailFor(key),
      name: PEOPLE[key].name,
      emailVerifiedAt: date('2026-01-10'),
      passwordHash,
    })),
  });
  await tx.membership.createMany({
    data: personKeys.map((key) => {
      const person: {
        roles: readonly string[];
        jobTitle: string;
        department: DepartmentKey;
        manager?: string;
      } = PEOPLE[key];
      return {
        id: member[key],
        ...org,
        userId: userIds[key],
        roles: [...person.roles] as never,
        jobTitle: person.jobTitle,
        departmentId: departmentIds[person.department],
        managerId: person.manager ? member[person.manager as PersonKey] : null,
        status: 'ACTIVE' as const,
        joinedAt: date('2026-01-12'),
      };
    }),
  });
  const firstWithRole = (role: string) =>
    personKeys.find((k) =>
      (PEOPLE[k].roles as readonly string[]).includes(role),
    );

  // ----------------------------------------------------------- governance rules
  await tx.ruleset.createMany({
    data: [
      {
        id: uuidv7(),
        ...org,
        version: 3,
        status: 'SUPERSEDED',
        config: {
          ...ruleset,
          rag: { greenMaxPpBehind: 5, amberMaxPpBehind: 20 },
        },
        changeSummary: 'FY2025 rules',
        proposedById: member.strategyHead,
        approvedById: member.ceo,
        effectiveFrom: date('2025-01-15'),
      },
      {
        id: uuidv7(),
        ...org,
        version: 4,
        status: 'ACTIVE',
        config: ruleset,
        changeSummary:
          'Amber band tightened to 15 pp; missed updates show Unknown.',
        proposedById: member.strategyHead,
        approvedById: member.ceo,
        effectiveFrom: date('2026-01-12'),
      },
    ],
  });
  await tx.customFieldDefinition.createMany({
    data: [
      {
        id: uuidv7(),
        ...org,
        entity: 'INITIATIVE',
        key: 'budget_code',
        label: 'Budget code',
        type: 'TEXT',
        sortOrder: 1,
      },
      {
        id: uuidv7(),
        ...org,
        entity: 'INITIATIVE',
        key: 'funding_source',
        label: 'Funding source',
        type: 'SELECT',
        options: ['Capex', 'Opex', 'Partner funded'],
        sortOrder: 2,
      },
    ],
  });

  // ----------------------------------------------------------- strategy
  const planId = uuidv7();
  await tx.strategicPlan.create({
    data: {
      id: planId,
      ...org,
      name: PLAN.name,
      startDate: date(PLAN.startDate),
      endDate: date(PLAN.endDate),
      version: PLAN.version,
      status: 'APPROVED',
      template: 'STRATEGIC_PILLARS',
      vision: PLAN.vision,
      mission: PLAN.mission,
      values: [...PLAN.values],
      aspiration: PLAN.aspiration,
      approvedAt: date(PLAN.approvedAt),
      approvedById: member.ceo,
    },
  });
  const levelIds = LEVELS.map(() => uuidv7());
  await tx.frameworkLevel.createMany({
    data: LEVELS.map((level, i) => ({
      id: levelIds[i],
      ...org,
      planId,
      ...level,
    })),
  });
  const elementIds: Record<string, string> = {};
  for (const e of [...PILLARS, ...OBJECTIVES]) elementIds[e.code] = uuidv7();
  await tx.strategyElement.createMany({
    data: [
      ...PILLARS.map((p, i) => ({
        id: elementIds[p.code],
        ...org,
        planId,
        levelId: levelIds[0],
        code: p.code,
        title: p.title,
        sponsorId: member[p.sponsor],
        sortOrder: i,
      })),
      ...OBJECTIVES.map((o, i) => ({
        id: elementIds[o.code],
        ...org,
        planId,
        levelId: levelIds[1],
        parentId: elementIds[o.pillar],
        code: o.code,
        title: o.title,
        ownerId: member[o.owner],
        sortOrder: i,
      })),
    ],
  });

  // ----------------------------------------------------------- reporting periods (Jan–Oct 2026)
  const periodIds: Record<string, string> = {};
  await tx.reportingPeriod.createMany({
    data: MONTHS.map((month, i) => {
      const name = `${month} 2026`;
      const id = (periodIds[name] = uuidv7());
      const mm = String(i + 1).padStart(2, '0');
      const isCurrent = month === 'October';
      return {
        id,
        ...org,
        planId,
        name,
        startDate: date(`2026-${mm}-01`),
        endDate: endOfMonth(date(`2026-${mm}-01`)),
        status: isCurrent ? ('SPONSOR_REVIEW' as const) : ('LOCKED' as const),
        submissionOpensAt: atTime(`2026-${mm}-08`, '08:00'),
        submissionDueAt: atTime(`2026-${mm}-10`, '16:00'),
        strategyReviewDueAt: atTime(`2026-${mm}-14`, '16:00'),
        sponsorReviewDueAt: atTime(`2026-${mm}-17`, '16:00'),
        reportIssueDueAt: atTime(`2026-${mm}-22`, '16:00'),
        lockedAt: isCurrent
          ? null
          : atTime(`2026-${String(i + 2).padStart(2, '0')}-08`, '12:00'),
      };
    }),
  });
  const periodFor = (d: Date) =>
    periodIds[`${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`];

  // ----------------------------------------------------------- KPIs
  const kpiIds: Record<string, string> = {};
  const objectiveOwner = Object.fromEntries(
    OBJECTIVES.map((o) => [o.code, o.owner]),
  );
  await tx.kpi.createMany({
    data: KPIS.map((k) => ({
      id: (kpiIds[k.code] = uuidv7()),
      ...org,
      elementId: elementIds[k.objective],
      code: k.code,
      name: k.name,
      unit: k.unit,
      direction: k.direction,
      frequency: 'MONTHLY' as const,
      baseline: k.baseline,
      baselineDate: date('2024-01-01'),
      target: k.target,
      ownerId: member[objectiveOwner[k.objective] as PersonKey],
      // Latest value and trajectory are calculated from the verified actuals below.
    })),
  });
  await tx.kpiTarget.createMany({
    data: KPIS.flatMap((k) => [
      {
        id: uuidv7(),
        ...org,
        kpiId: kpiIds[k.code],
        label: 'FY2025',
        targetDate: date('2025-12-31'),
        value:
          Math.round((k.baseline + (k.target - k.baseline) / 2) * 100) / 100,
      },
      {
        id: uuidv7(),
        ...org,
        kpiId: kpiIds[k.code],
        label: 'FY2026',
        targetDate: date('2026-12-31'),
        value: k.target,
      },
    ]),
  });
  await tx.kpiActual.createMany({
    data: KPIS.flatMap((k) => {
      const from = k.baseline + (k.latest - k.baseline) * 0.55;
      const spread = Math.abs(k.latest - k.baseline) * 0.03;
      return KPI_ACTUAL_MONTHS.map((month, i) => {
        const last = i === KPI_ACTUAL_MONTHS.length - 1;
        const wiggle = last ? 0 : (((i * 7) % 3) - 1) * spread;
        const value = last
          ? k.latest
          : from +
            ((k.latest - from) * i) / (KPI_ACTUAL_MONTHS.length - 1) +
            wiggle;
        return {
          id: uuidv7(),
          ...org,
          kpiId: kpiIds[k.code],
          periodId: periodIds[month],
          value: Math.round(value * 100) / 100,
          submittedById: member[objectiveOwner[k.objective] as PersonKey],
          verifiedById: member.strategyAnalyst,
          verifiedAt: atTime(
            `2026-${String(6 + i).padStart(2, '0')}-12`,
            '10:00',
          ),
        };
      });
    }),
  });

  await recalculateKpiPositions(tx, Object.values(kpiIds), ruleset);
  const positions = await tx.kpi.findMany({
    where: { id: { in: Object.values(kpiIds) } },
    select: { code: true, trajectory: true },
  });
  const drift = positions.filter(
    (p) => KPIS.find((k) => k.code === p.code)!.trajectory !== p.trajectory,
  );
  if (drift.length) {
    throw new Error(
      `Demo KPI trajectories no longer match the wireframe: ${drift.map((p) => `${p.code} is ${p.trajectory}`).join(', ')}`,
    );
  }

  // ----------------------------------------------------------- initiatives
  const initiativeIds: Record<string, string> = {};
  const specByCode = Object.fromEntries(
    ALL_INITIATIVES.map((s) => [s.code, s]),
  );
  const personDept = (key: PersonKey) => departmentIds[PEOPLE[key].department];
  const lastUpdateFor = (spec: InitiativeSpec, i: number) =>
    spec.lastUpdate
      ? date(spec.lastUpdate)
      : date(`2026-10-${String(8 + (i % 7)).padStart(2, '0')}`);

  await tx.initiative.createMany({
    data: ALL_INITIATIVES.map((spec, i) => {
      const id = (initiativeIds[spec.code] = uuidv7());
      const status = spec.status ?? 'ACTIVE';
      const budget =
        spec.code === 'DIG-004'
          ? 1_200 * MILLION
          : ((i % 6) + 2) * 100 * MILLION;
      const spentPct =
        spec.code === 'DIG-004'
          ? 0.58
          : (Math.min(spec.progress, 95) / 100) * 0.9;
      const delivery = computed.get(spec.code)!;
      const isLive = status === 'ACTIVE';
      const behindDays =
        spec.health === 'RED' ? 45 : spec.health === 'AMBER' ? 14 : 0;
      return {
        id,
        ...org,
        planId,
        code: spec.code,
        title: spec.title,
        description: `${spec.title} — part of the ${PLAN.name}.`,
        ownerId: spec.owner ? member[spec.owner] : null,
        sponsorId: member[spec.sponsor],
        benefitsOwnerId: spec.benefitsOwner
          ? member[spec.benefitsOwner]
          : spec.owner
            ? member[spec.owner]
            : null,
        departmentId: personDept(spec.owner ?? spec.sponsor),
        priority: spec.priority ?? 2,
        status,
        isSensitive: spec.isSensitive ?? false,
        baselineStart: delivery.start,
        activatedAt:
          status === 'ACTIVE' || status === 'CLOSED' ? delivery.start : null,
        baselineEnd: date(spec.end),
        baselineBudget: budget,
        spentToDate: Math.round(budget * spentPct),
        forecastEnd:
          spec.code === 'DIG-007'
            ? date('2026-11-26')
            : isLive
              ? addDays(date(spec.end), behindDays)
              : null,
        actualEnd: status === 'CLOSED' ? date(spec.end) : null,
        calculatedHealth: delivery.health?.health ?? 'UNKNOWN',
        healthReasons: delivery.health
          ? (delivery.health.reasons as unknown as Prisma.InputJsonValue)
          : undefined,
        rulesetVersion: isLive ? 4 : null,
        ...(spec.code === 'DIG-004'
          ? {
              healthOverride: 'AMBER' as const,
              overrideReason:
                'Contract terms agreed; signature expected 22 Oct. Delivery dates unaffected.',
              overrideById: member.edBusiness,
              overrideAt: atTime('2026-10-13', '15:20'),
              overrideExpiresAt: date('2026-10-31'),
            }
          : {}),
        verifiedProgress: delivery.verified,
        plannedProgress: delivery.planned,
        impactScore: spec.impact,
        impactSummary:
          spec.impact === null ? 'Not yet measurable' : spec.impactSummary,
        trajectory: trajectoryFor(spec.impact),
        lastUpdateAt: isLive ? lastUpdateFor(spec, i) : null,
        lastVerifiedUpdateAt: isLive
          ? spec.code === 'DIG-007'
            ? date('2026-09-12')
            : date('2026-10-11')
          : null,
        customFields: {
          budget_code: `BC-${spec.code}`,
          funding_source: i % 3 === 0 ? 'Capex' : 'Opex',
        },
      };
    }),
  });

  // Objective links: weights per objective sum to 100.
  const contributors: Record<
    string,
    { code: string; weight?: number; primary: boolean }[]
  > = {};
  for (const spec of ALL_INITIATIVES) {
    (contributors[spec.objective] ??= []).push({
      code: spec.code,
      primary: true,
    });
    for (const extra of spec.alsoContributesTo ?? []) {
      (contributors[extra.objective] ??= []).push({
        code: spec.code,
        weight: extra.weight,
        primary: false,
      });
    }
  }
  await tx.initiativeObjectiveLink.createMany({
    data: Object.entries(contributors).flatMap(([objective, list]) => {
      const fixed = list.reduce((a, c) => a + (c.weight ?? 0), 0);
      const open = list.filter((c) => c.weight === undefined);
      const shares = allocate(
        Math.round((100 - fixed) * 100),
        open.map(() => 1),
      );
      let s = 0;
      return list.map((c) => ({
        ...org,
        initiativeId: initiativeIds[c.code],
        elementId: elementIds[objective],
        isPrimary: c.primary,
        contributionWeight: c.weight ?? shares[s++] / 100,
      }));
    }),
  });
  const firstKpiOf = Object.fromEntries(
    [...KPIS].reverse().map((k) => [k.objective, k.code]),
  );
  await tx.initiativeKpiLink.createMany({
    data: ALL_INITIATIVES.filter((s) => s.impact !== null).map((s) => ({
      ...org,
      initiativeId: initiativeIds[s.code],
      kpiId: kpiIds[firstKpiOf[s.objective]],
    })),
  });

  // Milestones
  const milestoneIds: Record<string, string> = {};
  let milestoneCount = 0;
  await tx.milestone.createMany({
    data: ALL_INITIATIVES.flatMap((spec) =>
      computed.get(spec.code)!.milestones.map((ms, order) => {
        milestoneCount++;
        const id = (milestoneIds[`${spec.code}:${ms.title}`] = uuidv7());
        return {
          id,
          ...org,
          initiativeId: initiativeIds[spec.code],
          title: ms.title,
          weight: ms.weight,
          isCritical: ms.isCritical ?? false,
          baselineStartDate: ms.baselineStartDate,
          baselineDate: ms.baselineDate,
          forecastDate: ms.forecastDate ?? null,
          actualDate: ms.actualDate ?? null,
          claimedCompletion: ms.claimedCompletion ?? ms.verifiedCompletion,
          verifiedCompletion: ms.verifiedCompletion,
          status: ms.status,
          sortOrder: order,
        };
      }),
    ),
  });
  const dig004Testing = milestoneIds['DIG-004:Testing and deployment'];
  const dig004Tech = milestoneIds['DIG-004:Technology development'];
  await tx.task.createMany({
    data: [
      {
        id: uuidv7(),
        ...org,
        milestoneId: dig004Testing,
        title: 'User acceptance testing complete',
        assigneeId: member.productManager,
        dueDate: date('2026-10-24'),
        status: 'IN_PROGRESS' as const,
      },
      {
        id: uuidv7(),
        ...org,
        milestoneId: dig004Testing,
        title: 'Penetration test sign-off',
        assigneeId: member.headTech,
        dueDate: date('2026-11-10'),
        status: 'TODO' as const,
      },
      {
        id: uuidv7(),
        ...org,
        milestoneId: dig004Tech,
        title: 'Portfolio rebalancing engine',
        assigneeId: member.productManager,
        dueDate: date('2026-10-20'),
        status: 'IN_PROGRESS' as const,
      },
      {
        id: uuidv7(),
        ...org,
        milestoneId: dig004Tech,
        title: 'KYC integration',
        assigneeId: member.productManager,
        dueDate: date('2026-09-30'),
        completedAt: date('2026-09-28'),
        status: 'DONE' as const,
      },
    ],
  });

  const dependencyIds: string[] = [];
  await tx.dependency.createMany({
    data: DEPENDENCIES.map((d) => {
      const id = uuidv7();
      dependencyIds.push(id);
      return {
        id,
        ...org,
        fromInitiativeId: initiativeIds[d.from],
        toInitiativeId: initiativeIds[d.to],
        description: d.description,
        isCriticalPath: d.isCriticalPath,
        status: d.status,
        blockedSince: 'blockedSince' in d ? date(d.blockedSince) : null,
        neededBy: 'neededBy' in d ? date(d.neededBy) : null,
      };
    }),
  });

  // ----------------------------------------------------------- reporting cycle history
  const active = ACTIVE_INITIATIVES;
  await tx.progressSnapshot.createMany({
    data: active.flatMap((spec) => {
      const points: Date[] = [];
      for (let m = 0; m < 9; m++) {
        const monthEnd = endOfMonth(
          date(`2026-${String(m + 1).padStart(2, '0')}-01`),
        );
        if (monthEnd > computed.get(spec.code)!.start) points.push(monthEnd);
      }
      points.push(date('2026-10-16'));
      return points.map((asOf) => {
        const isToday = asOf.getTime() === date('2026-10-16').getTime();
        const p = isToday
          ? {
              planned: computed.get(spec.code)!.planned,
              verified: spec.progress,
            }
          : progressAt(spec, computed.get(spec.code)!.start, asOf);
        return {
          id: uuidv7(),
          ...org,
          initiativeId: initiativeIds[spec.code],
          periodId: periodFor(asOf),
          asOf,
          plannedProgress: p.planned,
          verifiedProgress: p.verified,
          health: spec.health,
          impactScore:
            spec.impact === null
              ? null
              : Math.round(spec.impact * (isToday ? 1 : 0.85) * 100) / 100,
        };
      });
    }),
  });

  const ownerOrSponsor = (spec: InitiativeSpec) =>
    member[spec.owner ?? spec.sponsor];
  const september = active.filter(
    (s) => computed.get(s.code)!.start < date('2026-09-30'),
  );
  await tx.statusUpdate.createMany({
    data: september.map((spec) => {
      const p = progressAt(
        spec,
        computed.get(spec.code)!.start,
        date('2026-08-31'),
      );
      return {
        id: uuidv7(),
        ...org,
        initiativeId: initiativeIds[spec.code],
        periodId: periodIds['September 2026'],
        submittedById: ownerOrSponsor(spec),
        claimedProgress: p.verified,
        verifiedProgress: p.verified,
        plannedProgress: p.planned,
        healthAtSubmission: spec.health,
        status: 'APPROVED' as const,
        progressNarrative: 'Work progressed in line with the monthly plan.',
        submittedAt: atTime('2026-09-09', '14:00'),
        reviewedAt: atTime('2026-09-14', '11:00'),
        approvedAt: atTime('2026-09-17', '10:00'),
      };
    }),
  });

  const notSubmitted = new Set<string>(OCTOBER_UPDATE_STATE.notSubmitted);
  const challenged = new Set<string>(OCTOBER_UPDATE_STATE.challenged);
  const awaitingSponsor = new Set<string>(OCTOBER_UPDATE_STATE.awaitingSponsor);
  const octoberIds: Record<string, string> = {};
  await tx.statusUpdate.createMany({
    data: active
      .map((spec, i) => ({ spec, i }))
      .filter(({ spec }) => !notSubmitted.has(spec.code))
      .map(({ spec, i }) => {
        const status = challenged.has(spec.code)
          ? 'CHALLENGED'
          : awaitingSponsor.has(spec.code)
            ? 'REVIEWED'
            : 'APPROVED';
        const submittedAt = lastUpdateFor(spec, i);
        const behind = spec.planned - spec.progress;
        return {
          id: (octoberIds[spec.code] = uuidv7()),
          ...org,
          initiativeId: initiativeIds[spec.code],
          periodId: periodIds['October 2026'],
          submittedById: ownerOrSponsor(spec),
          claimedProgress:
            spec.code === 'DIG-004'
              ? 70
              : status === 'CHALLENGED'
                ? Math.min(100, spec.progress + 4)
                : spec.progress,
          verifiedProgress: spec.progress,
          plannedProgress: computed.get(spec.code)!.planned,
          healthAtSubmission:
            spec.code === 'DIG-004' ? ('AMBER' as const) : spec.health,
          progressNarrative:
            'Milestone work continued; see evidence attached to each milestone.',
          varianceExplanation:
            behind > 5
              ? 'Behind plan because of an upstream dependency and vendor delays.'
              : null,
          recoveryAction:
            behind > 5
              ? 'Recovery plan with re-sequenced milestones submitted to sponsor.'
              : null,
          nextSteps:
            'Complete in-flight milestones and confirm forecast dates.',
          needsDecision: spec.code === 'DIG-004',
          status: status as 'CHALLENGED' | 'REVIEWED' | 'APPROVED',
          submittedAt: addDays(submittedAt, 0.4),
          reviewedAt:
            status === 'CHALLENGED' ? null : atTime('2026-10-14', '12:00'),
          approvedAt:
            status === 'APPROVED' ? atTime('2026-10-16', '08:30') : null,
        };
      }),
  });
  const lines: [string, number, number, number][] = [
    ['Business case approved', 100, 100, 100],
    ['Vendor contract signed', 0, 0, 0],
    ['Technology development', 75, 95, 85],
    ['Testing and deployment', 30, 48, 44],
    ['Commercial launch', 0, 0, 0],
  ];
  await tx.statusUpdateLine.createMany({
    data: lines.map(([title, previous, claimed, verified]) => ({
      id: uuidv7(),
      ...org,
      updateId: octoberIds['DIG-004'],
      milestoneId: milestoneIds[`DIG-004:${title}`],
      previousVerified: previous,
      claimedCompletion: claimed,
      verifiedCompletion: verified,
    })),
  });
  const challengeId = uuidv7();
  await tx.comment.createMany({
    data: [
      {
        id: challengeId,
        ...org,
        entityType: 'StatusUpdate',
        entityId: octoberIds['DIG-004'],
        authorId: member.strategyAnalyst,
        kind: 'CHALLENGE' as const,
        createdAt: atTime('2026-10-12', '10:15'),
        body: 'Testing at 48% is not supported by evidence and Technology development at 95% needs the sprint report. Verified at 65% pending evidence.',
      },
      {
        id: uuidv7(),
        ...org,
        entityType: 'StatusUpdate',
        entityId: octoberIds['DIG-004'],
        parentId: challengeId,
        authorId: member.headDigital,
        kind: 'RESPONSE' as const,
        createdAt: atTime('2026-10-16', '10:42'),
        body: 'Uploading the UAT test log and sprint report today; will resubmit before the deadline.',
      },
    ],
  });

  // ----------------------------------------------------------- risks & issues
  const riskIds: Record<string, string> = {};
  const riskRows: Prisma.RiskIssueCreateManyInput[] = [];
  const cells = Object.entries(RISK_HEATMAP).flatMap(([impact, row]) =>
    Object.entries(row).flatMap(([likelihood, count]) =>
      Array.from({ length: count }, () => ({
        impact: Number(impact),
        likelihood: Number(likelihood),
      })),
    ),
  );
  for (const named of NAMED_RISKS) {
    const at = cells.findIndex(
      (c) => c.impact === named.impact && c.likelihood === named.likelihood,
    );
    if (at < 0) throw new Error(`No heatmap cell left for "${named.title}"`);
    cells.splice(at, 1);
  }
  const generated = cells.map((cell, i) => {
    const spec = active[(i * 7) % active.length];
    return {
      initiative: spec.code,
      title: RISK_TITLES[i],
      owner: (spec.owner ?? spec.sponsor) as PersonKey,
      ...cell,
    };
  });
  if (generated.length > RISK_TITLES.length)
    throw new Error('Not enough risk titles for the heatmap');
  for (const r of [...NAMED_RISKS, ...generated]) {
    const id = (riskIds[r.title] = uuidv7());
    riskRows.push({
      id,
      ...org,
      initiativeId: r.initiative ? initiativeIds[r.initiative] : null,
      type: 'RISK',
      title: r.title,
      likelihood: r.likelihood,
      impact: r.impact,
      severity: severityFor(r.likelihood, r.impact),
      ownerId: member[r.owner],
      mitigation:
        'mitigation' in r
          ? r.mitigation
          : 'Mitigation plan agreed with the initiative owner.',
      dueDate: 'dueDate' in r && r.dueDate ? date(r.dueDate) : null,
      status: 'OPEN',
    });
  }
  for (const issue of ISSUES) {
    const id = (riskIds[issue.key] = uuidv7());
    riskRows.push({
      id,
      ...org,
      initiativeId: initiativeIds[issue.initiative],
      type: 'ISSUE',
      title: issue.title,
      severity: issue.severity,
      ownerId: member[issue.owner],
      status: 'OPEN',
    });
  }
  await tx.riskIssue.createMany({ data: riskRows });

  // ----------------------------------------------------------- escalations (ladder from the ruleset)
  const levelByNumber = new Map(
    ruleset.escalation.levels.map((l) => [l.level, l]),
  );
  const decider = (spec: InitiativeSpec, level: number) => {
    const config = levelByNumber.get(level)!.decidedBy;
    if (config.type === 'INITIATIVE_OWNER')
      return {
        decisionFromId: spec.owner ? member[spec.owner] : null,
        decisionFromRole: null,
      };
    if (config.type === 'INITIATIVE_SPONSOR')
      return { decisionFromId: member[spec.sponsor], decisionFromRole: null };
    const key = firstWithRole(config.role);
    return {
      decisionFromId: key ? member[key] : null,
      decisionFromRole: config.role,
    };
  };
  const escalationRows: Prisma.EscalationCreateManyInput[] = [];
  const changeRows: Prisma.EscalationLevelChangeCreateManyInput[] = [];
  const escalationIdByTitle: Record<string, string> = {};
  ESCALATIONS.forEach((spec, i) => {
    const id = (escalationIdByTitle[spec.title] = uuidv7());
    const initiative = specByCode[spec.initiative];
    const raisedAt = daysAgo(spec.ageDays);
    const history = escalationHistory(spec, ruleset);
    const final = history.at(-1)!;
    escalationRows.push({
      id,
      ...org,
      reference: `ESC-${String(i + 1).padStart(4, '0')}`,
      source: spec.source,
      title: spec.title,
      severity: spec.severity,
      initiativeId: initiativeIds[spec.initiative],
      riskIssueId: spec.issue
        ? riskIds[spec.issue]
        : spec.risk
          ? riskIds[spec.risk]
          : null,
      dependencyId: spec.initiative === 'DIG-007' ? dependencyIds[0] : null,
      level: final.level,
      status: spec.resolved ? 'RESOLVED' : 'OPEN',
      raisedById: spec.source === 'MANUAL' ? ownerOrSponsor(initiative) : null,
      ...decider(initiative, final.level),
      raisedAt,
      levelChangedAt: addDays(raisedAt, final.afterDays),
      resolvedAt: spec.resolved
        ? addDays(raisedAt, spec.resolved.afterDays)
        : null,
      resolution: spec.resolved?.resolution ?? null,
      // Two sources are not allowed at once: prefer the issue/risk link.
      ...(spec.issue || spec.risk ? { dependencyId: null } : {}),
    });
    history.forEach((step, n) =>
      changeRows.push({
        id: uuidv7(),
        ...org,
        escalationId: id,
        fromLevel: n === 0 ? null : history[n - 1].level,
        toLevel: step.level,
        toLevelName: levelByNumber.get(step.level)!.name,
        rulesetVersion: 4,
        reason: step.reason,
        createdAt: addDays(raisedAt, step.afterDays),
      }),
    );
  });
  await tx.escalation.createMany({ data: escalationRows });
  await tx.escalationLevelChange.createMany({ data: changeRows });

  // ----------------------------------------------------------- decisions & change requests
  for (const d of DECISIONS) {
    let approvalId: string | null = null;
    if (d.changeRequest) {
      approvalId = uuidv7();
      await tx.approval.create({
        data: {
          id: approvalId,
          ...org,
          reference: d.reference,
          type: d.changeRequest.type,
          entityType: 'Initiative',
          entityId: initiativeIds[d.initiative!],
          payload: d.changeRequest.payload as Prisma.InputJsonValue,
          justification: d.changeRequest.justification,
          requestedById: member[d.changeRequest.requestedBy],
          reviewerId: d.requiredFromPerson
            ? member[d.requiredFromPerson]
            : null,
          createdAt: daysAgo(4),
        },
      });
    }
    await tx.decision.create({
      data: {
        id: uuidv7(),
        ...org,
        initiativeId: d.initiative ? initiativeIds[d.initiative] : null,
        reference: d.reference,
        title: d.title,
        context: d.context,
        requiredFrom: d.requiredFrom,
        requiredFromId: d.requiredFromPerson
          ? member[d.requiredFromPerson]
          : null,
        approvalId,
        escalationId:
          d.reference === 'GOV-028'
            ? escalationIdByTitle['Shared data engineering team over-allocated']
            : null,
        dueDate: d.dueDate ? date(d.dueDate) : null,
        outcome: d.outcome,
        outcomeNotes: d.outcomeNotes,
        decidedById: d.decidedBy ? member[d.decidedBy] : null,
        decidedAt: d.decidedAt ? date(d.decidedAt) : null,
        deferredUntil: d.deferredUntil ? date(d.deferredUntil) : null,
      },
    });
  }

  // ----------------------------------------------------------- benefits
  const others = {
    expected: PORTFOLIO_EXPECTED.map((t, q) => t - DIG_004_BENEFIT.expected[q]),
    realised: PORTFOLIO_REALISED.map((t, q) => t - DIG_004_BENEFIT.realised[q]),
    q4Forecast: PORTFOLIO_Q4_FORECAST - DIG_004_BENEFIT.q4Forecast,
  };
  const shares = SHARED_BENEFITS.map((b) => b.share);
  const split = {
    expected: others.expected.map((t) => allocate(t, shares)),
    realised: others.realised.map((t) => allocate(t, shares)),
    q4Forecast: allocate(others.q4Forecast, shares),
  };
  const benefitDefs = [
    {
      initiative: DIG_004_BENEFIT.initiative,
      name: DIG_004_BENEFIT.name,
      expected: [...DIG_004_BENEFIT.expected],
      realised: [...DIG_004_BENEFIT.realised],
      q4Forecast: DIG_004_BENEFIT.q4Forecast,
      later: [...DIG_004_BENEFIT.later],
      expectedBy: '2027-06-30',
    },
    ...SHARED_BENEFITS.map((b, n) => ({
      initiative: b.initiative,
      name: b.name,
      expected: split.expected.map((q) => q[n]),
      realised: split.realised.map((q) => q[n]),
      q4Forecast: split.q4Forecast[n],
      later: [] as { periodEnd: string; expected: number }[],
      expectedBy: '2026-12-31',
    })),
  ];
  for (const b of benefitDefs) {
    const id = uuidv7();
    const total =
      b.expected.reduce((a, v) => a + v, 0) +
      b.later.reduce((a, v) => a + v.expected, 0);
    const realised = b.realised.reduce((a, v) => a + v, 0);
    await tx.benefit.create({
      data: {
        id,
        ...org,
        initiativeId: initiativeIds[b.initiative],
        name: b.name,
        type: 'FINANCIAL',
        unit: 'NGN',
        expectedValue: total * MILLION,
        expectedBy: date(b.expectedBy),
        realisedToDate: realised * MILLION,
      },
    });
    await tx.benefitProfile.createMany({
      data: [
        ...QUARTERS.map((q, n) => ({
          id: uuidv7(),
          ...org,
          benefitId: id,
          periodEnd: date(q.periodEnd),
          expectedValue: b.expected[n] * MILLION,
          forecastValue: n === 3 ? b.q4Forecast * MILLION : null,
        })),
        ...b.later.map((l) => ({
          id: uuidv7(),
          ...org,
          benefitId: id,
          periodEnd: date(l.periodEnd),
          expectedValue: l.expected * MILLION,
        })),
      ],
    });
    await tx.benefitActual.createMany({
      data: QUARTERS.slice(0, 3)
        .map((q, n) => ({ q, value: b.realised[n] }))
        .filter(({ value }) => value > 0)
        .map(({ q, value }) => ({
          id: uuidv7(),
          ...org,
          benefitId: id,
          periodId: periodIds[q.actualPeriod!],
          realisedValue: value * MILLION,
          verifiedById: member.headFinance,
          verifiedAt: endOfMonth(date(q.periodEnd)),
        })),
    });
  }

  // ----------------------------------------------------------- rollups
  // Pillar and objective scores come from the same code the API runs,
  // before reporting snapshots freeze them.
  await recalculateElementRollups(tx, planId, ruleset, AS_OF);

  // ----------------------------------------------------------- reports
  // Every locked month has its reporting snapshot, as locking produces one.
  // (Demo snapshots all hold today's figures; real ones freeze each month.)
  const lockedPeriods = await tx.reportingPeriod.findMany({
    where: { organisationId, status: 'LOCKED' },
    orderBy: { startDate: 'asc' },
  });
  const snapshotIds: Record<string, string> = {};
  for (const period of lockedPeriods) {
    snapshotIds[period.name] = await captureReportSnapshot(tx, {
      organisationId,
      period,
      rules: ruleset,
      now: period.lockedAt ?? period.endDate,
      createdById: member.strategyHead,
    });
  }
  const packs = [
    {
      period: 'June 2026',
      template: 'QUARTERLY_BOARD',
      title: 'Q2 2026 Board pack',
      audience: 'BOARD',
      formats: ['PDF', 'PPTX'],
      version: '1.1',
      issuedAt: '2026-07-22',
    },
    {
      period: 'August 2026',
      template: 'MONTHLY_MANAGEMENT',
      title: 'August management report',
      audience: 'EXCO',
      formats: ['PDF'],
      version: '1.0',
      issuedAt: '2026-09-08',
    },
    {
      period: 'September 2026',
      template: 'MONTHLY_MANAGEMENT',
      title: 'September management report',
      audience: 'EXCO',
      formats: ['PDF'],
      version: '1.0',
      issuedAt: '2026-10-08',
    },
  ] as const;
  for (const p of packs) {
    const snapshotId = snapshotIds[p.period];
    const id = uuidv7();
    await tx.reportPack.create({
      data: {
        id,
        ...org,
        periodId: periodIds[p.period],
        snapshotId,
        template: p.template,
        title: p.title,
        audience: p.audience,
        sections: [
          'executive_summary',
          'pillar_performance',
          'delivery_vs_value',
          'exceptions',
          'decisions',
          'benefits',
        ],
        formats: [...p.formats],
        status: 'READY',
        version: p.version,
        requestedById: member.strategyHead,
        // Placeholder keys: files are produced once report generation and storage exist.
        fileKeys: Object.fromEntries(
          p.formats.map((f) => [
            f,
            `${organisationId}/reports/${id}.${f.toLowerCase()}`,
          ]),
        ),
        issuedAt: date(p.issuedAt),
      },
    });
  }

  // ----------------------------------------------------------- evidence, audit trail, notifications
  const dig004 = initiativeIds['DIG-004'];
  await tx.document.createMany({
    data: [
      [
        'DIG-004:Business case approved',
        'DIG-004 business case v2.pdf',
        'application/pdf',
        412_331,
      ],
      [
        'DIG-004:Business case approved',
        'EXCO approval minute.pdf',
        'application/pdf',
        96_120,
      ],
      [
        'DIG-004:Technology development',
        'Sprint 14 report.pdf',
        'application/pdf',
        230_874,
      ],
    ].map(([key, fileName, mimeType, sizeBytes]) => {
      const id = uuidv7();
      const entityId = milestoneIds[key as string];
      return {
        id,
        ...org,
        entityType: 'Milestone',
        entityId,
        fileName: fileName as string,
        storageKey: `${organisationId}/Milestone/${entityId}/${id}`,
        mimeType: mimeType as string,
        sizeBytes: sizeBytes as number,
        uploadedById: member.productManager,
        reviewedById:
          key === 'DIG-004:Business case approved'
            ? member.strategyAnalyst
            : null,
        reviewedAt:
          key === 'DIG-004:Business case approved' ? date('2026-04-02') : null,
        createdAt:
          key === 'DIG-004:Technology development'
            ? atTime('2026-10-11', '09:30')
            : date('2026-03-28'),
      };
    }),
  });
  await tx.auditEvent.createMany({
    data: [
      {
        action: 'RULESET_APPROVED',
        entityType: 'Ruleset',
        entityId: organisationId,
        actorId: member.ceo,
        at: atTime('2026-01-12', '11:00'),
        after: { version: 4 },
      },
      {
        action: 'MILESTONE_FORECAST_CHANGED',
        entityType: 'Milestone',
        entityId: milestoneIds['DIG-004:Vendor contract signed'],
        actorId: member.headDigital,
        at: atTime('2026-10-09', '16:05'),
        before: { forecastDate: '2026-10-07' },
        after: { forecastDate: '2026-10-22' },
      },
      {
        action: 'EVIDENCE_UPLOADED',
        entityType: 'Milestone',
        entityId: dig004Tech,
        actorId: member.productManager,
        at: atTime('2026-10-11', '09:30'),
        after: { fileName: 'Sprint 14 report.pdf' },
      },
      {
        action: 'UPDATE_SUBMITTED',
        entityType: 'Initiative',
        entityId: dig004,
        actorId: member.headDigital,
        at: atTime('2026-10-11', '17:40'),
        after: { claimedProgress: 70, verifiedProgress: 65 },
      },
      {
        action: 'RECOVERY_PLAN_REQUESTED',
        entityType: 'Initiative',
        entityId: dig004,
        actorId: member.strategyHead,
        at: atTime('2026-10-12', '09:10'),
        after: { dueDate: '2026-10-20' },
      },
      {
        action: 'STATUS_OVERRIDE',
        entityType: 'Initiative',
        entityId: dig004,
        actorId: member.edBusiness,
        at: atTime('2026-10-13', '15:20'),
        before: { health: 'RED' },
        after: { health: 'AMBER', expiresAt: '2026-10-31' },
      },
    ].map(({ at, ...event }) => ({
      id: uuidv7(),
      ...org,
      createdAt: at,
      ...event,
    })),
  });
  await tx.notification.createMany({
    data: [
      {
        membershipId: member.headDigital,
        type: 'UPDATE_CHALLENGED',
        title: 'October update for DIG-004 was challenged',
        link: '/my-updates',
        createdAt: atTime('2026-10-12', '10:15'),
      },
      {
        membershipId: member.headDigital,
        type: 'RECOVERY_PLAN_REQUESTED',
        title: 'Recovery plan requested for DIG-004 — due 20 Oct',
        link: '/initiatives/DIG-004',
        createdAt: atTime('2026-10-12', '09:10'),
      },
      {
        membershipId: member.ceo,
        type: 'DECISION_REQUIRED',
        title: 'CR-0142 needs your decision by 18 Oct',
        link: '/',
        createdAt: daysAgo(4),
      },
      {
        membershipId: member.strategyHead,
        type: 'DECISION_OVERDUE',
        title: 'GOV-031 is 3 days overdue',
        link: '/',
        createdAt: daysAgo(0),
      },
    ].map((n) => ({ id: uuidv7(), ...org, ...n })),
  });

  return {
    organisationId,
    organisationSlug: DEMO_ORG.slug,
    users: personKeys.length,
    initiatives: ALL_INITIATIVES.length,
    milestones: milestoneCount,
    kpis: KPIS.length,
    risks: riskRows.length,
    escalations: escalationRows.length,
    decisions: DECISIONS.length,
  };
}
