import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { emailFor } from '../../prisma/seed/demo/people.js';
import { CLOCK, FixedClock } from '../../src/common/clock/clock.js';
import { createAdminPool } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';
import { loadDemo, signInAs } from '../setup/demo.js';

const AMARA = emailFor('strategyHead'); // Strategy Office: sees and overrides everything
const HASSAN = emailFor('headDigital'); // owner of DIG-004
const ED_BUSINESS = emailFor('edBusiness'); // sponsor of DIG-004
const COO = emailFor('coo'); // sponsor of other initiatives

/** The wireframes' snapshot moment. */
const DEMO_NOW = new Date('2026-10-16T09:00:00Z');

interface Item {
  id: string;
  code: string;
  health: string;
  calculatedHealth: string;
  overridden: boolean;
  pillar: { code: string } | null;
  owner: { jobTitle: string } | null;
  dueDate: string;
  verifiedProgress: number;
  plannedProgress: number;
  variancePp: number;
  updateOverdue: { periodName: string } | null;
}

describe('Initiatives (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  let token: ReturnType<typeof signInAs>;
  const clock = new FixedClock(DEMO_NOW);
  const ids: Record<string, string> = {};

  const call = async (
    as: string,
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    body?: object,
  ) => {
    const bearer = await token(as);
    return request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .auth(bearer, { type: 'bearer' })
      .send(body);
  };
  const register = async (as: string, query = '') =>
    (await call(as, 'get', `/initiatives${query}`)).body;

  beforeAll(async () => {
    admin = createAdminPool();
    await loadDemo(admin);
    app = await createTestApp({
      overrides: [{ provide: CLOCK, useValue: clock }],
    });
    token = signInAs(app);
    const { rows } = await admin.query<{ code: string; id: string }>(
      `SELECT code, id FROM "Initiative"`,
    );
    for (const row of rows) ids[row.code] = row.id;
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  describe('recalculation', () => {
    it('finds nothing to change on the seeded data at the demo moment', async () => {
      const response = await call(AMARA, 'post', '/initiatives/recalculate');

      expect(response.status).toBe(200);
      // The seed was calculated by the same engine, so stored values are already right.
      expect(response.body).toEqual({
        checked: 32,
        changed: 0,
        healthChanges: [],
        // Pillar and objective rollups were seeded by the same code, too.
        elementsChanged: 0,
      });
    });

    it('is limited to the Strategy Office and admins', async () => {
      expect(
        (await call(HASSAN, 'post', '/initiatives/recalculate')).status,
      ).toBe(403);
    });
  });

  describe('register', () => {
    it('opens on active initiatives, worst first, with tab and health counts', async () => {
      const page = await register(AMARA);

      expect(page).toMatchObject({
        page: 1,
        pageSize: 10,
        total: 32,
        totalPages: 4,
        tabCounts: { active: 32, pipeline: 5, closed: 6, cancelled: 2 },
        healthCounts: { RED: 4, AMBER: 7, GREEN: 21, UNKNOWN: 0 },
      });
      // Delayed first (by due date), then at risk.
      expect(page.items.slice(0, 5).map((i: Item) => i.code)).toEqual([
        'DIG-007',
        'DIG-011',
        'REV-006',
        'CX-004',
        'DIG-004', // first at-risk by due date (31 Dec)
      ]);
    });

    it('shows each row as on the wireframe', async () => {
      const [dig007] = (await register(AMARA)).items as Item[];
      expect(dig007).toMatchObject({
        code: 'DIG-007',
        health: 'RED',
        pillar: { code: 'P2' },
        owner: { jobTitle: 'Head, Technology' },
        dueDate: '2026-10-15',
        verifiedProgress: 40,
        plannedProgress: 100,
        variancePp: -60,
        updateOverdue: { periodName: 'October 2026' },
      });
    });

    it('uses the override for display and filtering (DIG-004 is shown At risk)', async () => {
      const amber = await register(AMARA, '?health=AMBER&pageSize=20');
      const dig004 = amber.items.find((i: Item) => i.code === 'DIG-004');

      expect(amber.total).toBe(7);
      expect(dig004).toMatchObject({
        health: 'AMBER',
        calculatedHealth: 'RED',
        overridden: true,
      });
    });

    it('filters by pillar, search and department, and pages', async () => {
      const map = await call(AMARA, 'get', '/plans/current/map');
      const p2 = map.body.elements.find(
        (e: { code: string }) => e.code === 'P2',
      ).id;

      expect((await register(AMARA, `?elementId=${p2}`)).total).toBe(9);
      expect(
        (await register(AMARA, '?q=onboard')).items.map((i: Item) => i.code),
      ).toEqual(['DIG-007']);
      // Owner name search: Hassan Danjuma owns DIG-002, DIG-004 and DIG-005.
      expect(
        (await register(AMARA, '?q=danjuma&sort=code')).items.map(
          (i: Item) => i.code,
        ),
      ).toEqual(['DIG-002', 'DIG-004', 'DIG-005']);
      // Wildcards are literal: "%" matches nothing here.
      expect((await register(AMARA, '?q=%25')).total).toBe(0);

      const last = await register(AMARA, '?page=4');
      expect(last.items).toHaveLength(2);
      expect((await register(AMARA, '?page=9')).items).toEqual([]);
    });

    it('shows other tabs and sorts', async () => {
      const pipeline = await register(AMARA, '?tab=pipeline&sort=code');
      expect(pipeline.items.map((i: Item) => i.code)).toEqual([
        'CX-006',
        'DIG-015',
        'OPS-007',
        'PPL-005',
        'REV-009',
      ]);

      const behindFirst = await register(AMARA, '?sort=variance');
      expect(behindFirst.items[0].code).toBe('DIG-007');
    });

    it('hides sensitive initiatives from people without access, counts included', async () => {
      const page = await register(HASSAN);
      expect(page.tabCounts.active).toBe(30);
      expect(page.total).toBe(30);

      const sponsor = await register(COO, '?q=branch');
      expect(sponsor.items.map((i: Item) => i.code)).toEqual(['OPS-005']);
    });

    it('rejects bad query values with field errors', async () => {
      const response = await call(
        AMARA,
        'get',
        '/initiatives?health=PURPLE&pageSize=1000',
      );
      expect(response.status).toBe(400);
      expect(
        response.body.errors.map((e: { path: string }) => e.path).sort(),
      ).toEqual(['health.0', 'pageSize']);
    });
  });

  describe('detail', () => {
    it('shows DIG-004 as on the initiative detail page', async () => {
      const response = await call(
        HASSAN,
        'get',
        `/initiatives/${ids['DIG-004']}`,
      );
      const body = response.body;

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        code: 'DIG-004',
        priority: 1,
        pillar: { code: 'P2' },
        owner: { jobTitle: 'Head, Digital Business' },
        sponsor: { jobTitle: 'ED, Business' },
        benefitsOwner: { jobTitle: 'Head, Wealth' },
        baseline: { start: '2026-03-01', end: '2026-12-31' },
        budget: { spentPct: 58 },
        execution: { verified: 65, variancePp: -9 },
        health: {
          effective: 'AMBER',
          calculated: 'RED',
          override: {
            health: 'AMBER',
            reason: expect.stringContaining('signature expected 22 Oct'),
            by: { name: 'Tunde Bakare' },
          },
          updateOverdue: null,
        },
        impact: { summary: 'Pilot revenue 10% of target' },
      });
      expect(body.execution.planned).toBeCloseTo(74, 0);
      expect(
        body.contributesTo.map((c: { code: string; isPrimary: boolean }) => [
          c.code,
          c.isPrimary,
        ]),
      ).toEqual([
        ['O2.1', true],
        ['O1.1', false],
      ]);
    });

    it('lists milestones with contribution, overdue days and evidence', async () => {
      const { body } = await call(
        HASSAN,
        'get',
        `/initiatives/${ids['DIG-004']}`,
      );
      expect(
        body.milestones.map(
          (m: {
            title: string;
            contribution: number;
            overdueDays: number;
            evidenceCount: number;
          }) => [m.title, m.contribution, m.overdueDays, m.evidenceCount],
        ),
      ).toEqual([
        ['Business case approved', 20, 0, 2],
        ['Vendor contract signed', 0, 9, 0],
        ['Technology development', 34, 1, 1],
        ['Testing and deployment', 11, 0, 0],
        ['Commercial launch', 0, 0, 0],
      ]);
    });

    it('lists risks, dependencies, history and readable activity', async () => {
      const { body } = await call(
        HASSAN,
        'get',
        `/initiatives/${ids['DIG-004']}`,
      );

      expect(
        body.risks.map(
          (r: { severity: string; type: string }) => `${r.severity} ${r.type}`,
        ),
      ).toEqual([
        'CRITICAL ISSUE',
        'HIGH RISK', // same severity: alphabetical ("SEC product…" before "Vendor contract…")
        'HIGH ISSUE',
        'MEDIUM RISK',
      ]);
      expect(body.dependencies.blockedBy).toEqual([
        expect.objectContaining({
          code: 'DIG-011',
          status: 'BLOCKED',
          blockedSince: '2026-10-02',
        }),
      ]);
      expect(body.dependencies.enables).toEqual([
        expect.objectContaining({ code: 'REV-005', status: 'AT_RISK' }),
      ]);
      expect(body.progressHistory.at(-1)).toMatchObject({
        asOf: '2026-10-16',
        verified: 65,
      });

      const summaries = body.activity.map(
        (a: { summary: string }) => a.summary,
      );
      expect(summaries).toEqual(
        expect.arrayContaining([
          'Status overridden Red → Amber with reason',
          'Strategy Office requested a recovery plan',
          'Update submitted: 65% (claimed 70%, 5 pp not verified)',
          'Evidence uploaded for Technology development',
          'Forecast for Vendor contract signed moved 7 Oct → 22 Oct',
        ]),
      );
    });

    it('answers 404 for a sensitive initiative the caller may not see', async () => {
      expect(
        (await call(HASSAN, 'get', `/initiatives/${ids['OPS-005']}`)).status,
      ).toBe(404);
      expect(
        (await call(COO, 'get', `/initiatives/${ids['OPS-005']}`)).status,
      ).toBe(200);
    });
  });

  describe('overrides', () => {
    const body = {
      health: 'GREEN',
      reason: 'Vendor signed this morning; schedule restored.',
    };

    it('refuses owners when the minimum role is Executive Sponsor', async () => {
      const response = await call(
        HASSAN,
        'put',
        `/initiatives/${ids['DIG-004']}/override`,
        body,
      );
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('CANNOT_OVERRIDE');
    });

    it('refuses a sponsor of other initiatives', async () => {
      expect(
        (
          await call(
            COO,
            'put',
            `/initiatives/${ids['DIG-004']}/override`,
            body,
          )
        ).status,
      ).toBe(403);
    });

    it('lets the initiative’s own sponsor override, within the expiry limit', async () => {
      const tooLong = await call(
        ED_BUSINESS,
        'put',
        `/initiatives/${ids['DIG-004']}/override`,
        {
          ...body,
          expiresAt: '2026-12-31',
        },
      );
      expect(tooLong.status).toBe(400);
      expect(tooLong.body.errors[0].message).toContain('at most 30 days');

      const response = await call(
        ED_BUSINESS,
        'put',
        `/initiatives/${ids['DIG-004']}/override`,
        body,
      );
      expect(response.status).toBe(200);
      expect(response.body.health).toMatchObject({
        effective: 'GREEN',
        calculated: 'RED',
        override: {
          health: 'GREEN',
          by: { name: 'Tunde Bakare' },
          expiresAt: '2026-11-15T09:00:00.000Z',
        },
      });
    });

    it('requires a meaningful reason and a status different from the calculated one', async () => {
      const short = await call(
        AMARA,
        'put',
        `/initiatives/${ids['DIG-004']}/override`,
        { health: 'AMBER', reason: 'ok' },
      );
      expect(short.status).toBe(400);

      const same = await call(
        AMARA,
        'put',
        `/initiatives/${ids['DIG-004']}/override`,
        {
          health: 'RED',
          reason: 'Matches the calculated status anyway.',
        },
      );
      expect(same.status).toBe(400);
      expect(same.body.errors[0].path).toBe('health');
    });

    it('lets the Strategy Office remove it, and records both in the audit trail', async () => {
      const response = await call(
        AMARA,
        'delete',
        `/initiatives/${ids['DIG-004']}/override`,
      );
      expect(response.status).toBe(200);
      expect(response.body.health).toMatchObject({
        effective: 'RED',
        override: null,
      });

      const { rows } = await admin.query(
        `SELECT action FROM "AuditEvent" WHERE "entityId" = $1 AND action IN ('STATUS_OVERRIDE', 'OVERRIDE_REMOVED')
         ORDER BY "createdAt"`,
        [ids['DIG-004']],
      );
      expect(rows.map((r) => r.action)).toEqual([
        'STATUS_OVERRIDE',
        'STATUS_OVERRIDE',
        'OVERRIDE_REMOVED',
      ]);
    });

    it('stops showing an override once it expires', async () => {
      await call(
        ED_BUSINESS,
        'put',
        `/initiatives/${ids['DIG-004']}/override`,
        {
          health: 'AMBER',
          reason: 'Contract terms agreed; signature this week.',
          expiresAt: '2026-10-20',
        },
      );
      clock.set(new Date('2026-10-21T09:00:00Z'));
      const { body } = await call(
        HASSAN,
        'get',
        `/initiatives/${ids['DIG-004']}`,
      );
      expect(body.health).toMatchObject({ effective: 'RED', override: null });
      clock.set(DEMO_NOW);
    });
  });

  describe('as time passes', () => {
    it('raises planned progress and overdue days on recalculation', async () => {
      clock.set(new Date('2026-11-16T09:00:00Z'));
      const summary = (await call(AMARA, 'post', '/initiatives/recalculate'))
        .body;
      expect(summary.checked).toBe(32);
      expect(summary.changed).toBe(32);

      const { body } = await call(
        AMARA,
        'get',
        `/initiatives/${ids['REV-005']}`,
      );
      expect(body.health.updateOverdue.detail).toContain('overdue by 37 days');
      clock.set(DEMO_NOW);
      await call(AMARA, 'post', '/initiatives/recalculate');
    });
  });
});
