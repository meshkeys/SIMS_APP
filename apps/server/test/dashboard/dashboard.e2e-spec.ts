import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { emailFor } from '../../prisma/seed/demo/people.js';
import { CLOCK, FixedClock } from '../../src/common/clock/clock.js';
import { createAdminPool } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';
import { loadDemo, signInAs } from '../setup/demo.js';

const AMARA = emailFor('strategyHead'); // Strategy Office: sees everything
const HASSAN = emailFor('headDigital'); // cannot see the 2 sensitive initiatives

const DEMO_NOW = new Date('2026-10-16T09:00:00Z');

interface Performance {
  id: string;
  code: string;
  health: string;
  executionScore: number | null;
  impactScore: number | null;
  initiatives: number;
  atRisk: number;
  delayed: number;
}

describe('Dashboard (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  let token: ReturnType<typeof signInAs>;
  const ids: Record<string, string> = {};

  const dashboard = async (as = AMARA, query = '') => {
    const bearer = await token(as);
    return request(app.getHttpServer())
      .get(`/api/v1/dashboard${query}`)
      .auth(bearer, { type: 'bearer' });
  };
  const quadrantCounts = (body: {
    matrix: { quadrants: Record<string, { count: number }> };
  }) =>
    Object.fromEntries(
      Object.entries(body.matrix.quadrants).map(([q, cell]) => [q, cell.count]),
    );
  const matrixTotal = (body: Parameters<typeof quadrantCounts>[0]) =>
    Object.values(quadrantCounts(body)).reduce((a, b) => a + b, 0);

  beforeAll(async () => {
    admin = createAdminPool();
    await loadDemo(admin);
    app = await createTestApp({
      overrides: [{ provide: CLOCK, useValue: new FixedClock(DEMO_NOW) }],
    });
    token = signInAs(app);
    const rows = await admin.query(
      `SELECT code, id FROM "Initiative" UNION ALL SELECT code, id FROM "StrategyElement"`,
    );
    for (const row of rows.rows) ids[row.code] = row.id;
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  it('shows the whole plan in one call', async () => {
    const response = await dashboard();
    expect(response.status).toBe(200);
    const { body } = response;

    expect(body.asAt).toBe(DEMO_NOW.toISOString());
    expect(body.scope).toBeNull();
    expect(body.tiles).toEqual({
      active: 32,
      onTrack: 21,
      atRisk: 7,
      delayed: 4,
      unknown: 0,
      updatesOutstanding: 3,
    });

    // October's cycle is in sponsor review.
    expect(body.cycle.name).toBe('October 2026');
    expect(
      body.cycle.stages.map((s: { key: string; state: string }) => [
        s.key,
        s.state,
      ]),
    ).toEqual([
      ['OWNER_SUBMISSION', 'DONE'],
      ['STRATEGY_REVIEW', 'DONE'],
      ['SPONSOR_REVIEW', 'CURRENT'],
      ['REPORT_ISSUE', 'UPCOMING'],
    ]);
  });

  it('rolls pillar performance up from the initiatives', async () => {
    const { body } = await dashboard();
    const rows = body.performance as Performance[];
    expect(rows.map((p) => p.code)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5']);
    expect(rows.reduce((sum, p) => sum + p.initiatives, 0)).toBe(32);
    expect(rows.find((p) => p.code === 'P2')).toMatchObject({
      health: 'AMBER',
      executionScore: 79.58,
      impactScore: 42.83,
      initiatives: 9,
      atRisk: 3,
      delayed: 2,
    });
    expect(rows.find((p) => p.code === 'P5')).toMatchObject({
      health: 'GREEN',
      executionScore: 100,
      delayed: 0,
    });
  });

  it('places every active initiative in the delivery-vs-value matrix', async () => {
    const { body } = await dashboard();
    expect(body.matrix.lowValueThresholdPct).toBe(50);
    expect(quadrantCounts(body)).toEqual({
      ON_PLAN_VALUE_OK: 14,
      ON_PLAN_VALUE_LOW: 5,
      BEHIND_VALUE_OK: 3,
      BEHIND_VALUE_LOW: 4,
      NOT_MEASURABLE: 6,
    });
    expect(
      body.matrix.quadrants.BEHIND_VALUE_LOW.items.map(
        (i: { code: string }) => i.code,
      ),
    ).toEqual(['CX-001', 'CX-004', 'DIG-004', 'REV-006']);
  });

  it('lists the watchlist, decisions, escalations and milestones due', async () => {
    const { body } = await dashboard();
    // Same order as the register's default sort: worst first.
    expect(body.watchlist.map((i: { code: string }) => i.code)).toEqual([
      'DIG-007',
      'DIG-011',
      'REV-006',
      'CX-004',
      'DIG-004',
    ]);

    expect(body.decisions.total).toBe(3);
    expect(
      body.decisions.items.map((d: { reference: string }) => d.reference),
    ).toEqual(['GOV-031', 'CR-0142', 'CR-0139']);

    // Highest level first, then longest waiting; level names from the ladder.
    expect(body.escalations.total).toBe(16);
    expect(body.escalations.byLevel).toEqual([
      { level: 1, name: 'Initiative owner', count: 9 },
      { level: 2, name: 'Executive sponsor', count: 5 },
      { level: 3, name: 'MD/CEO · EXCO', count: 2 },
      { level: 4, name: 'Board', count: 0 },
    ]);
    expect(body.escalations.items[0]).toMatchObject({
      reference: 'ESC-0001',
      level: 3,
      levelName: 'MD/CEO · EXCO',
      daysAtLevel: 21,
      initiative: { code: 'DIG-007' },
    });

    expect(body.milestones).toMatchObject({ total: 10, overdue: 1 });
    expect(body.milestones.items).toHaveLength(8);
    expect(body.milestones.items[3]).toMatchObject({
      title: 'Vendor contract signed',
      initiative: { code: 'DIG-004' },
      dueDate: '2026-10-22',
      slipDays: 15,
      isCritical: true,
    });
  });

  it('narrows everything to one pillar', async () => {
    const response = await dashboard(AMARA, `?elementId=${ids.P2}`);
    expect(response.status).toBe(200);
    const { body } = response;
    expect(body.scope).toMatchObject({ code: 'P2' });
    expect(body.tiles).toMatchObject({
      active: 9,
      onTrack: 4,
      atRisk: 3,
      delayed: 2,
    });
    // Its objectives become the performance rows.
    const rows = body.performance as Performance[];
    expect(rows.map((p) => p.code)).toEqual(['O2.1', 'O2.2']);
    expect(rows.reduce((sum, p) => sum + p.initiatives, 0)).toBe(9);
    expect(matrixTotal(body)).toBe(9);
    for (const item of body.watchlist)
      expect(item.pillar).toMatchObject({ code: 'P2' });
    expect(body.escalations.total).toBeLessThan(16);
    for (const item of body.escalations.items)
      expect(item.initiative.code).toMatch(/^DIG-/);
  });

  it('leaves out sensitive initiatives the viewer may not see', async () => {
    const { body } = await dashboard(HASSAN);
    expect(body.tiles.active).toBe(30);
    expect(matrixTotal(body)).toBe(30);
    // OPS-004 and OPS-005 sit under P3.
    const p3 = (body.performance as Performance[]).find((p) => p.code === 'P3');
    expect(p3?.initiatives).toBe(4);
    for (const m of body.milestones.items)
      expect(['OPS-004', 'OPS-005']).not.toContain(m.initiative.code);
  });

  it('rejects an unknown or malformed scope', async () => {
    const missing = await dashboard(
      AMARA,
      '?elementId=01a14fd6-0000-7000-8000-000000000000',
    );
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('ELEMENT_NOT_FOUND');

    const malformed = await dashboard(AMARA, '?elementId=P2');
    expect(malformed.status).toBe(400);
  });

  it('re-rolls the pillar when an initiative leaves delivery', async () => {
    const bearer = await token(AMARA);
    const hold = await request(app.getHttpServer())
      .post(`/api/v1/initiatives/${ids['DIG-007']}/status`)
      .auth(bearer, { type: 'bearer' })
      .send({
        status: 'CANCELLED',
        reason: 'Superseded by the vendor re-tender',
      });
    expect(hold.status).toBe(200);

    const { body } = await dashboard();
    expect(body.tiles).toMatchObject({ active: 31, delayed: 3 });
    const p2 = (body.performance as Performance[]).find(
      (p) => p.code === 'P2',
    )!;
    expect(p2).toMatchObject({ initiatives: 8, delayed: 1 });
    // DIG-007 was the furthest behind, so P2 now scores higher.
    expect(p2.executionScore).toBeGreaterThan(79.58);
  });
});
