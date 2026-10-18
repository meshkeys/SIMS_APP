import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { emailFor } from '../../prisma/seed/demo/people.js';
import { createAdminPool } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';
import { loadDemo, signInAs } from '../setup/demo.js';

const AMARA = emailFor('strategyHead'); // Strategy Office + admin
const HASSAN = emailFor('headDigital'); // initiative owner
const COO = emailFor('coo'); // sponsor of the sensitive OPS-005

interface MapElement {
  id: string;
  parentId: string | null;
  code: string;
  title: string;
  depth: number;
  sponsor: { jobTitle: string } | null;
  executionScore: number | null;
  health: string;
  headlineKpi: { name: string; baseline: number; target: number } | null;
  initiatives: { total: number; byHealth: Record<string, number> };
}

describe('Strategy API (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  let token: ReturnType<typeof signInAs>;
  let planId: string;
  const http = () => request(app.getHttpServer());

  const get = async (as: string, path: string) => {
    const bearer = await token(as);
    return http().get(path).auth(bearer, { type: 'bearer' });
  };
  const send = async (
    as: string,
    method: 'post' | 'patch' | 'put' | 'delete',
    path: string,
    body?: object,
  ) => {
    const bearer = await token(as);
    return http()[method](path).auth(bearer, { type: 'bearer' }).send(body);
  };
  const map = async () =>
    (await get(AMARA, `/api/v1/plans/${planId}/map`)).body as {
      elements: MapElement[];
      levels: { id: string; label: string; elementCount: number }[];
    };
  const byCode = async (code: string) =>
    (await map()).elements.find((e) => e.code === code)!;

  beforeAll(async () => {
    admin = createAdminPool();
    await loadDemo(admin);
    app = await createTestApp();
    token = signInAs(app);
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  describe('reading the strategy map', () => {
    it('lists plans and marks the current one', async () => {
      const response = await get(HASSAN, '/api/v1/plans');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        expect.objectContaining({
          name: 'FY2024–2026 Strategic Plan',
          status: 'APPROVED',
          version: 3,
          isCurrent: true,
        }),
      ]);
      planId = response.body[0].id;
    });

    it('returns the whole map in one call, matching the wireframe', async () => {
      const response = await get(HASSAN, '/api/v1/plans/current/map');

      expect(response.status).toBe(200);
      const body = response.body;
      expect(body.plan).toMatchObject({
        id: planId,
        aspiration: expect.stringContaining('most trusted'),
      });
      expect(
        body.levels.map((l: { label: string; elementCount: number }) => [
          l.label,
          l.elementCount,
        ]),
      ).toEqual([
        ['Strategic pillar', 5],
        ['Strategic objective', 10],
      ]);
      expect(body.totals).toEqual({ kpis: 18, activeInitiatives: 32 });

      const elements = body.elements as MapElement[];
      expect(elements.filter((e) => e.depth === 1).map((e) => e.title)).toEqual(
        [
          'Revenue Diversification',
          'Digital Transformation',
          'Operational Excellence',
          'Customer Experience',
          'People & Capabilities',
        ],
      );

      const p1 = elements.find((e) => e.code === 'P1')!;
      expect(p1).toMatchObject({
        // Rolled up from its initiatives by the engine (delivered ÷ planned).
        executionScore: 95.91,
        health: 'GREEN',
        sponsor: { jobTitle: 'ED, Business' },
        parentId: null,
      });

      const o11 = elements.find((e) => e.code === 'O1.1')!;
      expect(o11).toMatchObject({
        parentId: p1.id,
        health: 'GREEN',
        headlineKpi: {
          name: 'Non-interest income share',
          baseline: 18,
          target: 30,
        },
      });
      // Its 4 home initiatives plus REV-002 and DIG-004 contributing from elsewhere.
      expect(o11.initiatives.total).toBe(6);
    });

    it('shows an element with KPI progress and contributing initiatives', async () => {
      const o11 = await byCode('O1.1');
      const response = await get(AMARA, `/api/v1/elements/${o11.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        code: 'O1.1',
        level: { label: 'Strategic objective' },
        breadcrumb: [
          {
            code: 'P1',
            title: 'Revenue Diversification',
            levelLabel: 'Strategic pillar',
          },
        ],
        owner: { jobTitle: 'Head, Business Development' },
      });
      expect(
        response.body.kpis.map(
          (k: {
            name: string;
            baseline: number;
            currentTarget: { label: string; value: number };
            latestValue: number;
            progressToTarget: number;
          }) => [
            k.name,
            k.baseline,
            k.currentTarget.label,
            k.currentTarget.value,
            k.latestValue,
            k.progressToTarget,
          ],
        ),
      ).toEqual([
        ['Non-interest income share', 18, 'FY2026', 30, 23, 41.7],
        ['Fee income growth (YoY)', 6, 'FY2026', 20, 14, 57.1],
      ]);

      const contributors = response.body.contributors as {
        code: string;
        status: string;
        contributionWeight: number;
        isPrimary: boolean;
      }[];
      expect(contributors[0]).toMatchObject({
        code: 'REV-002',
        contributionWeight: 35,
        isPrimary: false,
      });
      // Delivering work only: the proposed REV-009 is left out; the closed REV-010 still counts.
      const codes = contributors.map((c) => c.code);
      expect(codes).not.toContain('REV-009');
      expect(contributors.find((c) => c.code === 'REV-010')?.status).toBe(
        'CLOSED',
      );
    });

    it('hides sensitive initiatives from people without access, but counts them', async () => {
      const o31 = await byCode('O3.1');

      const asOwner = await get(HASSAN, `/api/v1/elements/${o31.id}`);
      expect(
        asOwner.body.contributors.map((c: { code: string }) => c.code),
      ).not.toContain('OPS-005');
      expect(asOwner.body.hiddenContributors).toBe(1);

      const asSponsor = await get(COO, `/api/v1/elements/${o31.id}`);
      expect(
        asSponsor.body.contributors.map((c: { code: string }) => c.code),
      ).toContain('OPS-005');
      expect(asSponsor.body.hiddenContributors).toBe(0);
    });

    it('offers framework templates for onboarding', async () => {
      const response = await get(HASSAN, '/api/v1/framework-templates');
      expect(response.body.map((t: { key: string }) => t.key)).toEqual([
        'STRATEGIC_PILLARS',
        'BALANCED_SCORECARD',
        'OKR',
        'PUBLIC_SECTOR_RESULTS',
        'CUSTOM',
      ]);
    });
  });

  describe('changing the strategy tree', () => {
    it('lets only the Strategy Office and admins edit', async () => {
      const response = await send(
        HASSAN,
        'post',
        `/api/v1/plans/${planId}/elements`,
        { title: 'Sustainability' },
      );
      expect(response.status).toBe(403);
    });

    it('adds a sixth pillar with the next code, then an objective under it', async () => {
      const coo = (
        await get(AMARA, '/api/v1/elements/' + (await byCode('P3')).id)
      ).body.sponsor.membershipId;
      const pillar = await send(
        AMARA,
        'post',
        `/api/v1/plans/${planId}/elements`,
        {
          title: 'Sustainability',
          sponsorId: coo,
        },
      );
      expect(pillar.status).toBe(201);
      expect(pillar.body).toMatchObject({
        code: 'P6',
        depth: 1,
        level: { label: 'Strategic pillar' },
      });

      const objective = await send(
        AMARA,
        'post',
        `/api/v1/plans/${planId}/elements`,
        {
          parentId: pillar.body.id,
          title: 'Reach net-zero operations',
        },
      );
      expect(objective.status).toBe(201);
      expect(objective.body).toMatchObject({
        code: 'O6.1',
        breadcrumb: [{ code: 'P6' }],
      });

      expect((await map()).levels.map((l) => l.elementCount)).toEqual([6, 11]);
    });

    it('refuses an owner from another organisation', async () => {
      const signup = await http().post('/api/v1/auth/signup').send({
        organisationName: 'Other Co',
        sector: 'PRIVATE',
        country: 'NG',
        name: 'Other Admin',
        email: 'admin@other.example',
        password: 'other-password-123',
      });
      const foreignMember = signup.body.session.membership.id;

      const response = await send(
        AMARA,
        'post',
        `/api/v1/plans/${planId}/elements`,
        {
          title: 'Planted',
          ownerId: foreignMember,
        },
      );
      expect(response.status).toBe(400);
      expect(response.body.errors[0].path).toBe('ownerId');
    });

    it('refuses a duplicate code', async () => {
      const response = await send(
        AMARA,
        'post',
        `/api/v1/plans/${planId}/elements`,
        { title: 'Clash', code: 'P1' },
      );
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('CODE_TAKEN');
    });

    it('moves an objective to another pillar, only one level up', async () => {
      const o61 = await byCode('O6.1');
      const p3 = await byCode('P3');
      const moved = await send(AMARA, 'patch', `/api/v1/elements/${o61.id}`, {
        parentId: p3.id,
        title: 'Net-zero operations',
      });
      expect(moved.status).toBe(200);
      expect(moved.body).toMatchObject({
        title: 'Net-zero operations',
        breadcrumb: [{ code: 'P3' }],
      });

      const o11 = await byCode('O1.1');
      const wrongDepth = await send(
        AMARA,
        'patch',
        `/api/v1/elements/${o61.id}`,
        { parentId: o11.id },
      );
      expect(wrongDepth.status).toBe(400);
    });

    it('refuses to delete items that still hold things, deletes empty ones', async () => {
      const o11 = await byCode('O1.1');
      const inUse = await send(AMARA, 'delete', `/api/v1/elements/${o11.id}`);
      expect(inUse.status).toBe(409);
      expect(inUse.body.code).toBe('ELEMENT_IN_USE');

      const o61 = await byCode('O6.1');
      expect(
        (await send(AMARA, 'delete', `/api/v1/elements/${o61.id}`)).status,
      ).toBe(204);
      const p6 = await byCode('P6');
      expect(
        (await send(AMARA, 'delete', `/api/v1/elements/${p6.id}`)).status,
      ).toBe(204);
      expect((await map()).levels.map((l) => l.elementCount)).toEqual([5, 10]);
    });

    it('records changes in the audit trail', async () => {
      const { rows } = await admin.query(
        `SELECT action, count(*)::int AS n FROM "AuditEvent"
         WHERE action LIKE 'ELEMENT_%' GROUP BY action ORDER BY action`,
      );
      expect(rows).toEqual([
        { action: 'ELEMENT_CREATED', n: 2 },
        { action: 'ELEMENT_DELETED', n: 2 },
        { action: 'ELEMENT_UPDATED', n: 1 },
      ]);
    });
  });

  describe('framework levels', () => {
    const current = async () =>
      (await get(AMARA, `/api/v1/plans/${planId}/levels`)).body as {
        id: string;
        label: string;
        pluralLabel: string;
        codePrefix: string;
        allowsKpis: boolean;
      }[];

    it('renames levels, which every screen then uses', async () => {
      const [pillar, objective] = await current();
      const response = await send(
        AMARA,
        'put',
        `/api/v1/plans/${planId}/levels`,
        {
          levels: [
            {
              ...pillar,
              label: 'Theme',
              pluralLabel: 'Themes',
              codePrefix: 't',
            },
            objective,
          ],
        },
      );
      expect(response.status).toBe(200);
      expect(
        response.body.map((l: { label: string; codePrefix: string }) => [
          l.label,
          l.codePrefix,
        ]),
      ).toEqual([
        ['Theme', 'T'],
        ['Strategic objective', 'O'],
      ]);
      expect((await map()).levels[0].label).toBe('Theme');
    });

    it('adds a third level below objectives, then removes it while empty', async () => {
      const levels = await current();
      const added = await send(AMARA, 'put', `/api/v1/plans/${planId}/levels`, {
        levels: [
          ...levels,
          {
            label: 'Key result',
            pluralLabel: 'Key results',
            codePrefix: 'KR',
            allowsKpis: true,
          },
        ],
      });
      expect(added.status).toBe(200);
      expect(added.body).toHaveLength(3);

      const removed = await send(
        AMARA,
        'put',
        `/api/v1/plans/${planId}/levels`,
        { levels },
      );
      expect(removed.status).toBe(200);
      expect(removed.body).toHaveLength(2);
    });

    it('refuses to remove a level that holds items', async () => {
      const [pillar] = await current();
      const response = await send(
        AMARA,
        'put',
        `/api/v1/plans/${planId}/levels`,
        { levels: [pillar] },
      );
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('LEVEL_IN_USE');
    });

    it('refuses to switch off KPIs on a level that has them', async () => {
      const [pillar, objective] = await current();
      const response = await send(
        AMARA,
        'put',
        `/api/v1/plans/${planId}/levels`,
        {
          levels: [pillar, { ...objective, allowsKpis: false }],
        },
      );
      expect(response.status).toBe(409);
      expect(response.body.errors[0].path).toBe('levels.1.allowsKpis');
    });
  });

  describe('plans for a new organisation', () => {
    it('creates a Balanced Scorecard plan with its four perspectives', async () => {
      const other = await token('admin@other.example', 'other-password-123');
      expect(
        (
          await http()
            .get('/api/v1/plans/current/map')
            .auth(other, { type: 'bearer' })
        ).body.code,
      ).toBe('NO_PLAN');

      const created = await http()
        .post('/api/v1/plans')
        .auth(other, { type: 'bearer' })
        .send({
          name: 'Strategy 2027–2030',
          startDate: '2027-01-01',
          endDate: '2030-12-31',
          template: 'BALANCED_SCORECARD',
        });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ status: 'DRAFT', isCurrent: true });

      const plan = await http()
        .get(`/api/v1/plans/${created.body.id}/map`)
        .auth(other, { type: 'bearer' });
      expect(plan.body.levels.map((l: { label: string }) => l.label)).toEqual([
        'Perspective',
        'Strategic objective',
      ]);
      expect(
        plan.body.elements.map(
          (e: { code: string; title: string }) => `${e.code} ${e.title}`,
        ),
      ).toEqual([
        'P1 Financial',
        'P2 Customer',
        'P3 Internal process',
        'P4 Learning and growth',
      ]);
    });

    it('validates plan dates', async () => {
      const other = await token('admin@other.example', 'other-password-123');
      const response = await http()
        .post('/api/v1/plans')
        .auth(other, { type: 'bearer' })
        .send({
          name: 'Backwards',
          startDate: '2030-01-01',
          endDate: '2027-01-01',
        });
      expect(response.status).toBe(400);
      expect(response.body.errors[0].path).toBe('endDate');
    });

    it('cannot read another organisation’s plan or elements', async () => {
      const other = await token('admin@other.example', 'other-password-123');
      const o11 = await byCode('O1.1');

      expect(
        (
          await http()
            .get(`/api/v1/plans/${planId}/map`)
            .auth(other, { type: 'bearer' })
        ).status,
      ).toBe(404);
      expect(
        (
          await http()
            .get(`/api/v1/elements/${o11.id}`)
            .auth(other, { type: 'bearer' })
        ).status,
      ).toBe(404);
    });
  });
});
