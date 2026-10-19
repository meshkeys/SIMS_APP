import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { emailFor } from '../../prisma/seed/demo/people.js';
import { CLOCK, FixedClock } from '../../src/common/clock/clock.js';
import { createAdminPool } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';
import { loadDemo, signInAs } from '../setup/demo.js';

const AMARA = emailFor('strategyHead'); // Strategy Office
const HASSAN = emailFor('headDigital'); // owns objective O2.1: KPIs K05 and K06
const OLU = emailFor('headCompliance'); // owns no KPI

const DEMO_NOW = new Date('2026-10-16T09:00:00Z');
const M = 1_000_000;

interface Row {
  kpi: { id: string; code: string };
  previous: { period: string; value: number } | null;
  actual: {
    value: number;
    verified: boolean;
    recordedBy: { name: string } | null;
    verifiedBy: { name: string } | null;
  } | null;
  target: number | null;
  targetLabel: string | null;
  can: { record: boolean; verify: boolean };
}

describe('KPI actuals and performance (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  let token: ReturnType<typeof signInAs>;
  const periods: Record<string, string> = {};
  const kpis: Record<string, string> = {};
  const http = () => request(app.getHttpServer());

  const call = async (
    as: string,
    method: 'get' | 'put' | 'post',
    path: string,
    body?: object,
  ) => {
    const bearer = await token(as);
    return http()
      [method](`/api/v1${path}`)
      .auth(bearer, { type: 'bearer' })
      .send(body);
  };
  const october = () => `/periods/${periods['October 2026']}/kpi-actuals`;
  const rowOf = (body: { rows: Row[] }, code: string) =>
    body.rows.find((r) => r.kpi.code === code)!;
  const kpi = async (code: string) =>
    (await call(AMARA, 'get', `/kpis/${kpis[code]}`)).body as {
      latestValue: number;
      latestAt: string;
      trajectory: string;
    };

  beforeAll(async () => {
    admin = createAdminPool();
    await loadDemo(admin);
    app = await createTestApp({
      overrides: [{ provide: CLOCK, useValue: new FixedClock(DEMO_NOW) }],
    });
    token = signInAs(app);
    for (const row of (
      await admin.query(`SELECT name, id FROM "ReportingPeriod"`)
    ).rows)
      periods[row.name] = row.id;
    for (const row of (await admin.query(`SELECT code, id FROM "Kpi"`)).rows)
      kpis[row.code] = row.id;
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  describe('performance overview', () => {
    it('reproduces the KPIs & benefits page for FY2026', async () => {
      const response = await call(AMARA, 'get', '/performance');

      expect(response.status).toBe(200);
      const body = response.body;
      expect(body).toMatchObject({
        year: 2026,
        years: [2024, 2025, 2026],
        asAt: '2026-10-16',
        currency: 'NGN',
        benefits: {
          expected: 4200 * M,
          expectedToDate: 2700 * M,
          realisedToDate: 1900 * M,
          realisedPctOfExpected: 70,
        },
        kpis: {
          total: 18,
          onTrajectory: 9,
          slightlyBehind: 5,
          offTrajectory: 4,
          notMeasurable: 0,
        },
        can: { recordKpiActuals: true },
      });
      expect(
        body.benefits.quarters.map(
          (q: {
            expected: number;
            realised: number | null;
            forecast: number | null;
            captureRate: number | null;
          }) => [
            q.expected / M,
            q.realised === null ? null : q.realised / M,
            q.forecast === null ? null : q.forecast / M,
            q.captureRate,
          ],
        ),
      ).toEqual([
        [600, 520, null, 87],
        [900, 700, null, 78],
        [1200, 680, null, 57],
        [1500, null, 900, null],
      ]);
    });

    it('lists delivered work that is not creating value, lowest impact first', async () => {
      const { body } = await call(AMARA, 'get', '/performance');

      expect(body.lowValue.thresholdPct).toBe(50);
      expect(body.lowValue.count).toBe(body.lowValue.items.length);
      const titles = body.lowValue.items.map((i: { title: string }) => i.title);
      expect(titles).toEqual(
        expect.arrayContaining([
          'Self-service Kiosks',
          'Mobile App Relaunch',
          'Agent Banking Rollout',
        ]),
      );
      expect(
        body.lowValue.items.find(
          (i: { title: string }) => i.title === 'Mobile App Relaunch',
        ),
      ).toMatchObject({
        status: 'CLOSED',
        delivery: 100,
        impactScore: 35,
        impactSummary: 'Active users 35% of target',
      });
      const impacts = body.lowValue.items.map(
        (i: { impactScore: number }) => i.impactScore,
      );
      expect(impacts).toEqual([...impacts].sort((a, b) => a - b));
      expect(Math.max(...impacts)).toBeLessThan(50);
    });

    it('gives each KPI its year target, latest reading and a six-month trend', async () => {
      const { body } = await call(AMARA, 'get', '/performance');

      const k01 = body.scorecard.find(
        (k: { code: string }) => k.code === 'K01',
      );
      expect(k01).toMatchObject({
        name: 'Non-interest income share',
        topLevel: { code: 'P1' },
        baseline: 18,
        target: 30,
        targetLabel: 'FY2026',
        latestValue: 23,
        latestAt: '2026-09-30',
        trajectory: 'SLIGHTLY_BEHIND',
      });
      expect(k01.trend).toHaveLength(6);
      expect(k01.trend[0].period).toBe('April 2026');
      expect(k01.trend.at(-1)).toEqual({
        period: 'September 2026',
        periodEnd: '2026-09-30',
        value: 23,
      });
    });

    it('reports an earlier year with its own target and readings', async () => {
      const { body } = await call(AMARA, 'get', '/performance?year=2025');

      expect(body.year).toBe(2025);
      expect(body.benefits.expected).toBe(0);
      const k01 = body.scorecard.find(
        (k: { code: string }) => k.code === 'K01',
      );
      expect(k01).toMatchObject({
        targetLabel: 'FY2025',
        target: 24,
        trend: [],
      });
    });

    it('rejects a year outside the plan', async () => {
      const response = await call(AMARA, 'get', '/performance?year=2030');

      expect(response.status).toBe(400);
      expect(response.body.errors[0]).toMatchObject({
        path: 'year',
        message: 'Choose a year of the plan (2024 to 2026)',
      });
    });

    it('offers recording only to the Strategy Office and KPI owners', async () => {
      expect((await call(HASSAN, 'get', '/performance')).body.can).toEqual({
        recordKpiActuals: true,
      });
      expect((await call(OLU, 'get', '/performance')).body.can).toEqual({
        recordKpiActuals: false,
      });
    });
  });

  describe('KPI actuals', () => {
    it('lists every KPI with last month’s verified reading and the year’s target', async () => {
      const response = await call(HASSAN, 'get', october());

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        period: { name: 'October 2026', endDate: '2026-10-31' },
        counts: { kpis: 18, recorded: 0, verified: 0 },
        open: true,
      });
      expect(rowOf(response.body, 'K05')).toMatchObject({
        previous: { period: 'September 2026', value: 58 },
        target: 75,
        targetLabel: 'FY2026',
        actual: null,
        can: { record: true, verify: false },
      });
      // Hassan does not own K01.
      expect(rowOf(response.body, 'K01').can).toEqual({
        record: false,
        verify: false,
      });
    });

    it('lets an owner record their own KPI, unverified until the Strategy Office checks it', async () => {
      const response = await call(HASSAN, 'put', october(), {
        actuals: [
          {
            kpiId: kpis.K05,
            value: 66,
            commentary: 'Card tokenisation went live',
          },
        ],
      });

      expect(response.status).toBe(200);
      expect(rowOf(response.body, 'K05')).toMatchObject({
        actual: {
          value: 66,
          verified: false,
          recordedBy: { name: expect.any(String) },
          verifiedBy: null,
        },
        can: { record: true, verify: false },
      });
      expect(response.body.counts).toEqual({
        kpis: 18,
        recorded: 1,
        verified: 0,
      });
      // An unverified reading does not move the KPI.
      expect(await kpi('K05')).toMatchObject({
        latestValue: 58,
        trajectory: 'SLIGHTLY_BEHIND',
      });
    });

    it('stops owners recording KPIs they do not own', async () => {
      const response = await call(HASSAN, 'put', october(), {
        actuals: [{ kpiId: kpis.K01, value: 25 }],
      });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('NOT_KPI_OWNER');
    });

    it('rejects unknown and repeated KPIs field by field', async () => {
      const response = await call(AMARA, 'put', october(), {
        actuals: [
          { kpiId: kpis.K01, value: 25 },
          { kpiId: kpis.K01, value: 26 },
          { kpiId: '00000000-0000-7000-8000-000000000000', value: 1 },
        ],
      });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual([
        expect.objectContaining({
          path: 'actuals.1.kpiId',
          message: 'Each KPI can appear once',
        }),
        expect.objectContaining({
          path: 'actuals.2.kpiId',
          message: 'Choose a KPI of this plan',
        }),
      ]);
    });

    it('moves the KPI, its trajectory and the pillar impact once verified', async () => {
      const pillarBefore = await admin.query(
        `SELECT "impactScore" FROM "StrategyElement" WHERE code = 'P2'`,
      );

      const response = await call(AMARA, 'post', `${october()}/verify`, {
        kpiIds: [kpis.K05],
      });

      expect(response.status).toBe(200);
      expect(rowOf(response.body, 'K05')).toMatchObject({
        actual: {
          value: 66,
          verified: true,
          verifiedBy: { name: expect.any(String) },
        },
        can: { record: true, verify: false },
      });
      // 45 → 75, now at 66: 70% of the way.
      expect(await kpi('K05')).toMatchObject({
        latestValue: 66,
        latestAt: '2026-10-31',
        trajectory: 'ON_TRAJECTORY',
      });
      const pillarAfter = await admin.query(
        `SELECT "impactScore" FROM "StrategyElement" WHERE code = 'P2'`,
      );
      expect(Number(pillarAfter.rows[0].impactScore)).toBeGreaterThan(
        Number(pillarBefore.rows[0].impactScore),
      );
      const audit = await admin.query(
        `SELECT action FROM "AuditEvent" WHERE "entityId" = $1 ORDER BY "createdAt"`,
        [periods['October 2026']],
      );
      expect(audit.rows.map((r) => r.action)).toEqual(
        expect.arrayContaining([
          'KPI_ACTUALS_RECORDED',
          'KPI_ACTUALS_VERIFIED',
        ]),
      );
    });

    it('stops an owner changing a verified reading', async () => {
      const response = await call(HASSAN, 'put', october(), {
        actuals: [{ kpiId: kpis.K05, value: 70 }],
      });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('KPI_ACTUAL_VERIFIED');
      expect(
        rowOf((await call(HASSAN, 'get', october())).body, 'K05').can.record,
      ).toBe(false);
    });

    it('verifies the Strategy Office’s own readings as they are saved', async () => {
      const response = await call(AMARA, 'put', october(), {
        actuals: [{ kpiId: kpis.K13, value: 38 }],
      });

      expect(response.status).toBe(200);
      expect(rowOf(response.body, 'K13').actual).toMatchObject({
        value: 38,
        verified: true,
      });
      // NPS 22 → 45, now 38: 69.6% of the way.
      expect((await kpi('K13')).trajectory).toBe('ON_TRAJECTORY');
      const { body } = await call(AMARA, 'get', '/performance');
      expect(body.kpis).toMatchObject({
        onTrajectory: 11,
        slightlyBehind: 4,
        offTrajectory: 3,
      });
    });

    it('cannot verify a KPI with no reading', async () => {
      const response = await call(AMARA, 'post', `${october()}/verify`, {
        kpiIds: [kpis.K02],
      });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'KPI_ACTUAL_MISSING',
        detail: 'K02 has no October 2026 reading to verify yet.',
      });
    });

    it('leaves verifying to the Strategy Office', async () => {
      const response = await call(HASSAN, 'post', `${october()}/verify`, {
        kpiIds: [kpis.K05],
      });
      expect(response.status).toBe(403);
    });

    it('keeps a locked period’s readings as they were', async () => {
      const september = `/periods/${periods['September 2026']}/kpi-actuals`;
      const sheet = await call(AMARA, 'get', september);
      expect(sheet.body.open).toBe(false);
      expect(rowOf(sheet.body, 'K01')).toMatchObject({
        actual: { value: 23, verified: true },
        previous: { period: 'August 2026' },
        can: { record: false, verify: false },
      });

      const response = await call(AMARA, 'put', september, {
        actuals: [{ kpiId: kpis.K01, value: 24 }],
      });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('PERIOD_LOCKED');
    });
  });
});
