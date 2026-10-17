import { PrismaPg } from '@prisma/adapter-pg';
import type pg from 'pg';
import {
  seedDemo,
  type SeedSummary,
} from '../../prisma/seed/demo/seed-demo.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { createAdminPool, resetDatabase } from '../setup/admin-db.js';
import { TEST_DATABASE_ADMIN_URL } from '../setup/test-database.js';

/**
 * The demo data feeds every screen. These checks pin the numbers shown in the
 * wireframes, so a change to the seed that breaks a screen fails here first.
 */
describe('Demo seed', () => {
  let admin: pg.Pool;
  let prisma: PrismaClient;
  let summary: SeedSummary;

  const one = async <T>(sql: string): Promise<T> =>
    (await admin.query(sql, [summary.organisationId])).rows[0] as T;
  const rows = async <T>(sql: string): Promise<T[]> =>
    (await admin.query(sql, [summary.organisationId])).rows as T[];

  beforeAll(async () => {
    admin = createAdminPool();
    await resetDatabase(admin);
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: TEST_DATABASE_ADMIN_URL }),
    });
    await seedDemo(prisma);
    // Second run proves the seed is re-runnable (deletes and recreates the tenant).
    summary = await seedDemo(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await admin.end();
  });

  it('is re-runnable: exactly one demo organisation exists', async () => {
    const {
      rows: [{ n }],
    } = await admin.query(`SELECT count(*)::int AS n FROM "Organisation"`);
    expect(n).toBe(1);
  });

  it('has the strategy structure shown on the strategy map', async () => {
    const levels = await rows<{ depth: number; n: number }>(`
      SELECT l.depth, count(e.*)::int AS n FROM "FrameworkLevel" l
      JOIN "StrategyElement" e ON e."levelId" = l.id
      WHERE l."organisationId" = $1 GROUP BY l.depth ORDER BY l.depth`);
    expect(levels).toEqual([
      { depth: 1, n: 5 },
      { depth: 2, n: 10 },
    ]);
    expect(summary.kpis).toBe(18);
  });

  it('has the portfolio counts shown on the dashboard and register', async () => {
    const byStatus = await rows<{ status: string; n: number }>(`
      SELECT status, count(*)::int AS n FROM "Initiative" WHERE "organisationId" = $1 GROUP BY status ORDER BY status::text`);
    expect(byStatus).toEqual([
      { status: 'ACTIVE', n: 32 },
      { status: 'CANCELLED', n: 2 },
      { status: 'CLOSED', n: 6 },
      { status: 'PROPOSED', n: 5 },
    ]);

    const health = await rows<{ health: string; n: number }>(`
      SELECT COALESCE("healthOverride", "calculatedHealth") AS health, count(*)::int AS n
      FROM "Initiative" WHERE "organisationId" = $1 AND status = 'ACTIVE' GROUP BY 1 ORDER BY COALESCE("healthOverride", "calculatedHealth")::text`);
    expect(health).toEqual([
      { health: 'AMBER', n: 7 },
      { health: 'GREEN', n: 21 },
      { health: 'RED', n: 4 },
    ]);
  });

  it('places initiatives in the delivery-vs-value matrix as designed', async () => {
    const matrix = await one<Record<string, number>>(`
      SELECT
        count(*) FILTER (WHERE "impactScore" IS NULL)::int AS "notMeasurable",
        count(*) FILTER (WHERE eff = 'GREEN' AND "impactScore" >= 50)::int AS "onPlanValueOk",
        count(*) FILTER (WHERE eff = 'GREEN' AND "impactScore" < 50)::int AS "onPlanValueLow",
        count(*) FILTER (WHERE eff <> 'GREEN' AND "impactScore" >= 50)::int AS "behindValueOk",
        count(*) FILTER (WHERE eff <> 'GREEN' AND "impactScore" < 50)::int AS "behindValueLow"
      FROM (SELECT *, COALESCE("healthOverride", "calculatedHealth") AS eff FROM "Initiative"
            WHERE "organisationId" = $1 AND status = 'ACTIVE') i`);
    expect(matrix).toEqual({
      notMeasurable: 6,
      onPlanValueOk: 14,
      onPlanValueLow: 5,
      behindValueOk: 3,
      behindValueLow: 4,
    });
  });

  it('stores progress that matches the milestone formula for every initiative', async () => {
    const mismatches = await rows<{ code: string }>(`
      SELECT i.code FROM "Initiative" i
      JOIN "Milestone" m ON m."initiativeId" = i.id
      WHERE i."organisationId" = $1
      GROUP BY i.id
      HAVING sum(m.weight) > 0
         AND abs(sum(m.weight * m."verifiedCompletion") / sum(m.weight) - i."verifiedProgress") > 0.01`);
    expect(mismatches).toEqual([]);
  });

  it('gives every objective contribution weights that sum to 100', async () => {
    const off = await rows<{ code: string; total: string }>(`
      SELECT e.code, sum(l."contributionWeight")::text AS total
      FROM "InitiativeObjectiveLink" l JOIN "StrategyElement" e ON e.id = l."elementId"
      WHERE l."organisationId" = $1 GROUP BY e.code HAVING sum(l."contributionWeight") <> 100`);
    expect(off).toEqual([]);
  });

  it('fills the risk heatmap with 31 open risks', async () => {
    const { n } = await one<{ n: number }>(`
      SELECT count(*)::int AS n FROM "RiskIssue" WHERE "organisationId" = $1 AND type = 'RISK' AND status = 'OPEN'`);
    expect(n).toBe(31);
  });

  it('matches the escalation ladder counts and keeps a named level history', async () => {
    const ladder = await rows<{ level: number; n: number }>(`
      SELECT level, count(*)::int AS n FROM "Escalation"
      WHERE "organisationId" = $1 AND status = 'OPEN' GROUP BY level ORDER BY level`);
    expect(ladder).toEqual([
      { level: 1, n: 9 },
      { level: 2, n: 5 },
      { level: 3, n: 2 },
    ]);

    const history = await rows<{ toLevelName: string; reason: string }>(`
      SELECT c."toLevelName", c.reason FROM "EscalationLevelChange" c
      JOIN "Escalation" e ON e.id = c."escalationId"
      WHERE c."organisationId" = $1 AND e.title = 'Shared data engineering team over-allocated'
      ORDER BY c."createdAt"`);
    expect(history).toEqual([
      { toLevelName: 'Initiative owner', reason: 'RAISED' },
      { toLevelName: 'Executive sponsor', reason: 'AUTO_TIMEOUT' },
      { toLevelName: 'MD/CEO · EXCO', reason: 'AUTO_TIMEOUT' },
    ]);
  });

  it('has the three open decisions, two backed by change requests', async () => {
    const open = await rows<{ reference: string; hasApproval: boolean }>(`
      SELECT reference, "approvalId" IS NOT NULL AS "hasApproval" FROM "Decision"
      WHERE "organisationId" = $1 AND outcome = 'PENDING' ORDER BY reference`);
    expect(open).toEqual([
      { reference: 'CR-0139', hasApproval: true },
      { reference: 'CR-0142', hasApproval: true },
      { reference: 'GOV-031', hasApproval: false },
    ]);
  });

  it('reproduces the October cycle: 29 of 32 updates in, 6 challenged', async () => {
    const cycle = await one<{
      submitted: number;
      challenged: number;
      awaitingSponsor: number;
    }>(`
      SELECT count(*)::int AS submitted,
             count(*) FILTER (WHERE u.status = 'CHALLENGED')::int AS challenged,
             count(*) FILTER (WHERE u.status = 'REVIEWED')::int AS "awaitingSponsor"
      FROM "StatusUpdate" u JOIN "ReportingPeriod" p ON p.id = u."periodId"
      WHERE u."organisationId" = $1 AND p.name = 'October 2026'`);
    expect(cycle).toEqual({ submitted: 29, challenged: 6, awaitingSponsor: 3 });
  });

  it('reproduces the benefits chart totals (₦ millions)', async () => {
    const quarters = await rows<{
      quarter: string;
      expected: number;
      forecast: number | null;
    }>(`
      SELECT to_char(p."periodEnd", 'YYYY-MM') AS quarter,
             (sum(p."expectedValue") / 1e6)::int AS expected,
             (sum(p."forecastValue") / 1e6)::int AS forecast
      FROM "BenefitProfile" p WHERE p."organisationId" = $1 AND p."periodEnd" <= '2026-12-31'
      GROUP BY 1 ORDER BY 1`);
    expect(quarters).toEqual([
      { quarter: '2026-03', expected: 600, forecast: null },
      { quarter: '2026-06', expected: 900, forecast: null },
      { quarter: '2026-09', expected: 1200, forecast: null },
      { quarter: '2026-12', expected: 1500, forecast: 900 },
    ]);

    const { realised } = await one<{ realised: number }>(`
      SELECT (sum("realisedValue") / 1e6)::int AS realised FROM "BenefitActual" WHERE "organisationId" = $1`);
    expect(realised).toBe(1900);
  });

  it('keeps DIG-004 exactly as on the initiative detail page', async () => {
    const dig004 = await one<Record<string, unknown>>(`
      SELECT "verifiedProgress"::float AS progress, "plannedProgress"::float AS planned,
             "calculatedHealth" AS calculated, "healthOverride" AS override
      FROM "Initiative" WHERE "organisationId" = $1 AND code = 'DIG-004'`);
    expect(dig004).toEqual({
      progress: 65,
      planned: 74,
      calculated: 'RED',
      override: 'AMBER',
    });
  });
});
