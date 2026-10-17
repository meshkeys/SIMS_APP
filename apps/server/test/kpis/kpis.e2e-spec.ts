import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { emailFor } from '../../prisma/seed/demo/people.js';
import { createAdminPool } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';
import { loadDemo, signInAs } from '../setup/demo.js';

const AMARA = emailFor('strategyHead');
const HASSAN = emailFor('headDigital');

interface Kpi {
  id: string;
  code: string;
  name: string;
  baseline: number | null;
  planTarget: number | null;
  currentTarget: { label: string; value: number } | null;
  latestValue: number | null;
  trajectory: string;
  progressToTarget: number | null;
  targets: { label: string; targetDate: string; value: number }[];
  topLevel: { code: string };
  element: { id: string; code: string };
}

describe('KPI management (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  let token: ReturnType<typeof signInAs>;
  let planId: string;
  const elementIds: Record<string, string> = {};
  let k19: Kpi;
  const http = () => request(app.getHttpServer());

  const call = async (
    as: string,
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    path: string,
    body?: object,
  ) => {
    const bearer = await token(as);
    return http()
      [method](`/api/v1${path}`)
      .auth(bearer, { type: 'bearer' })
      .send(body);
  };
  const kpiByCode = async (code: string) =>
    ((await call(AMARA, 'get', `/plans/${planId}/kpis`)).body as Kpi[]).find(
      (k) => k.code === code,
    )!;

  beforeAll(async () => {
    admin = createAdminPool();
    await loadDemo(admin);
    app = await createTestApp();
    token = signInAs(app);
    const map = await call(AMARA, 'get', '/plans/current/map');
    planId = map.body.plan.id;
    for (const element of map.body.elements)
      elementIds[element.code] = element.id;
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  describe('reading', () => {
    it('lists a plan’s KPIs with progress and the pillar each rolls up to', async () => {
      const response = await call(HASSAN, 'get', `/plans/${planId}/kpis`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(18);
      expect(response.body[0]).toMatchObject({
        code: 'K01',
        name: 'Non-interest income share',
        baseline: 18,
        currentTarget: { label: 'FY2026', value: 30 },
        latestValue: 23,
        progressToTarget: 41.7,
        element: { code: 'O1.1' },
        topLevel: { code: 'P1' },
      });
    });

    it('narrows the list to one element', async () => {
      const response = await call(
        HASSAN,
        'get',
        `/plans/${planId}/kpis?elementId=${elementIds['O3.1']}`,
      );
      expect(response.body.map((k: Kpi) => k.code)).toEqual(['K09', 'K10']);
    });

    it('shows a KPI with targets, six months of actuals and linked initiatives', async () => {
      const k01 = await kpiByCode('K01');
      const response = await call(HASSAN, 'get', `/kpis/${k01.id}`);

      expect(response.status).toBe(200);
      expect(
        response.body.targets.map((t: Kpi['targets'][number]) => [
          t.label,
          t.value,
        ]),
      ).toEqual([
        ['FY2025', 24],
        ['FY2026', 30],
      ]);
      expect(response.body.actuals).toHaveLength(6);
      expect(response.body.actuals.at(-1)).toMatchObject({
        period: 'September 2026',
        value: 23,
        verified: true,
      });
      expect(
        response.body.linkedInitiatives.map((i: { code: string }) => i.code),
      ).toContain('REV-001');
    });
  });

  describe('creating', () => {
    it('adds a KPI to an objective with the next code and its targets', async () => {
      const response = await call(
        AMARA,
        'post',
        `/elements/${elementIds['O1.1']}/kpis`,
        {
          name: 'Wealth products per customer',
          unit: 'products',
          baseline: 1.2,
          baselineDate: '2024-01-01',
          target: 2,
          targets: [
            { label: 'FY2026', targetDate: '2026-12-31', value: 2 },
            { label: 'FY2025', targetDate: '2025-12-31', value: 1.6 },
          ],
        },
      );

      expect(response.status).toBe(201);
      k19 = response.body;
      expect(k19).toMatchObject({
        code: 'K19',
        direction: 'HIGHER_IS_BETTER',
        trajectory: 'NOT_MEASURABLE',
        latestValue: null,
        progressToTarget: null,
        currentTarget: { label: 'FY2026', value: 2 },
      });
      // Targets come back in date order whatever order they were sent in.
      expect(k19.targets.map((t) => t.label)).toEqual(['FY2025', 'FY2026']);

      const element = await call(
        AMARA,
        'get',
        `/elements/${elementIds['O1.1']}`,
      );
      expect(element.body.kpis.map((k: Kpi) => k.code)).toEqual([
        'K01',
        'K02',
        'K19',
      ]);
      const map = await call(AMARA, 'get', `/plans/${planId}/map`);
      expect(map.body.totals.kpis).toBe(19);
    });

    it('only on levels that hold KPIs', async () => {
      const response = await call(
        AMARA,
        'post',
        `/elements/${elementIds.P1}/kpis`,
        { name: 'Pillar KPI', unit: '%' },
      );
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('KPIS_NOT_ALLOWED');
      expect(response.body.detail).toContain(
        'Strategic pillars do not hold KPIs',
      );
    });

    it('catches targets on the wrong side of the baseline', async () => {
      const response = await call(
        AMARA,
        'post',
        `/elements/${elementIds['O3.1']}/kpis`,
        {
          name: 'Branch cost',
          unit: 'NGN m',
          direction: 'LOWER_IS_BETTER',
          baseline: 500,
          target: 650,
        },
      );
      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual([
        expect.objectContaining({ path: 'target' }),
      ]);
    });

    it('requires a range for within-range KPIs', async () => {
      const response = await call(
        AMARA,
        'post',
        `/elements/${elementIds['O2.2']}/kpis`,
        {
          name: 'Liquidity coverage',
          unit: '%',
          direction: 'WITHIN_RANGE',
          rangeLow: 120,
        },
      );
      expect(response.status).toBe(400);
      expect(response.body.errors.map((e: { path: string }) => e.path)).toEqual(
        ['rangeHigh'],
      );
    });

    it('keeps targets inside the plan period, with distinct dates', async () => {
      const response = await call(
        AMARA,
        'post',
        `/elements/${elementIds['O2.2']}/kpis`,
        {
          name: 'API calls per month',
          unit: 'm calls',
          targets: [
            { label: 'FY2030', targetDate: '2030-12-31', value: 9 },
            { label: 'A', targetDate: '2026-06-30', value: 3 },
            { label: 'B', targetDate: '2026-06-30', value: 4 },
          ],
        },
      );
      expect(response.status).toBe(400);
      expect(response.body.errors.map((e: { path: string }) => e.path)).toEqual(
        ['targets.0.targetDate', 'targets.2.targetDate'],
      );
    });

    it('refuses a duplicate code and lets only editors create', async () => {
      const duplicate = await call(
        AMARA,
        'post',
        `/elements/${elementIds['O1.1']}/kpis`,
        {
          code: 'K01',
          name: 'Clash',
          unit: '%',
        },
      );
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe('CODE_TAKEN');

      const forbidden = await call(
        HASSAN,
        'post',
        `/elements/${elementIds['O1.1']}/kpis`,
        { name: 'X', unit: '%' },
      );
      expect(forbidden.status).toBe(403);
    });
  });

  describe('editing', () => {
    it('updates the definition and moves the KPI to another objective', async () => {
      const response = await call(AMARA, 'patch', `/kpis/${k19.id}`, {
        name: 'Products per wealth client',
        elementId: elementIds['O1.2'],
      });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: 'Products per wealth client',
        element: { code: 'O1.2' },
      });
    });

    it('validates the definition after the change', async () => {
      const response = await call(AMARA, 'patch', `/kpis/${k19.id}`, {
        direction: 'LOWER_IS_BETTER',
      });
      expect(response.status).toBe(400);
      expect(response.body.errors[0].path).toBe('target');
    });

    it('will not move a KPI onto a level without KPIs', async () => {
      const response = await call(AMARA, 'patch', `/kpis/${k19.id}`, {
        elementId: elementIds.P2,
      });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('KPIS_NOT_ALLOWED');
    });

    it('replaces the interim targets', async () => {
      const response = await call(AMARA, 'put', `/kpis/${k19.id}/targets`, {
        targets: [{ label: 'Q4 2026', targetDate: '2026-12-31', value: 2.1 }],
      });
      expect(response.status).toBe(200);
      expect(response.body.targets).toEqual([
        expect.objectContaining({ label: 'Q4 2026', value: 2.1 }),
      ]);
    });
  });

  describe('deleting', () => {
    it('keeps KPIs whose actuals feed past reports', async () => {
      const k01 = await kpiByCode('K01');
      const response = await call(AMARA, 'delete', `/kpis/${k01.id}`);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('KPI_HAS_ACTUALS');
    });

    it('deletes a KPI without history, recording it in the audit trail', async () => {
      expect((await call(AMARA, 'delete', `/kpis/${k19.id}`)).status).toBe(204);
      expect((await call(AMARA, 'get', `/kpis/${k19.id}`)).status).toBe(404);

      const { rows } = await admin.query(
        `SELECT action FROM "AuditEvent" WHERE "entityId" = $1 ORDER BY "createdAt"`,
        [k19.id],
      );
      expect(rows.map((r) => r.action)).toEqual([
        'KPI_CREATED',
        'KPI_UPDATED',
        'KPI_TARGETS_CHANGED',
        'KPI_DELETED',
      ]);
    });
  });

  describe('isolation', () => {
    it('hides one organisation’s KPIs from another', async () => {
      await http().post('/api/v1/auth/signup').send({
        organisationName: 'Elsewhere Ltd',
        sector: 'PRIVATE',
        country: 'NG',
        name: 'Elsewhere Admin',
        email: 'admin@elsewhere.example',
        password: 'elsewhere-password',
      });
      const k01 = await kpiByCode('K01');
      const other = await token(
        'admin@elsewhere.example',
        'elsewhere-password',
      );

      const response = await http()
        .get(`/api/v1/kpis/${k01.id}`)
        .auth(other, { type: 'bearer' });
      expect(response.status).toBe(404);
    });
  });
});
