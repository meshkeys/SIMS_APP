import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { emailFor } from '../../prisma/seed/demo/people.js';
import { CLOCK, FixedClock } from '../../src/common/clock/clock.js';
import { createAdminPool } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';
import { loadDemo, signInAs } from '../setup/demo.js';

const AMARA = emailFor('strategyHead'); // Strategy Office
const CHAIR = emailFor('boardChair'); // Board member
const HASSAN = emailFor('headDigital'); // initiative owner

const DEMO_NOW = new Date('2026-10-16T09:00:00Z');
const SENSITIVE = ['OPS-004', 'OPS-005'];

interface Snapshot {
  id: string;
  period: string;
  quarter: string | null;
  usable: boolean;
  pillars: { id: string; code: string; title: string }[];
}

describe('Report packs (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  let token: ReturnType<typeof signInAs>;
  let september: Snapshot;

  const call = async (
    as: string,
    method: 'get' | 'post',
    path: string,
    body?: object,
  ) => {
    const bearer = await token(as);
    return request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .auth(bearer, { type: 'bearer' })
      .send(body);
  };
  const board = (over: object = {}) => ({
    snapshotId: september.id,
    template: 'QUARTERLY_BOARD',
    audience: 'BOARD',
    sections: [
      'executive_summary',
      'pillar_performance',
      'delivery_vs_value',
      'exceptions',
      'decisions',
      'benefits',
    ],
    narrative: 'Execution is broadly on plan; digital delivery is slipping.',
    ...over,
  });
  type Section = { key: string; [k: string]: unknown };
  const sectionOf = (body: { sections: Section[] }, key: string) =>
    body.sections.find((s) => s.key === key)!;

  beforeAll(async () => {
    admin = createAdminPool();
    await loadDemo(admin);
    app = await createTestApp({
      overrides: [{ provide: CLOCK, useValue: new FixedClock(DEMO_NOW) }],
    });
    token = signInAs(app);
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  describe('snapshots', () => {
    it('lists each locked cycle, newest first, with its pillars', async () => {
      const response = await call(AMARA, 'get', '/reports/snapshots');

      expect(response.status).toBe(200);
      const periods = (response.body as Snapshot[]).map((s) => s.period);
      expect(periods[0]).toBe('September 2026');
      expect(periods).toHaveLength(9);
      september = response.body[0];
      expect(september).toMatchObject({ quarter: 'Q3 2026', usable: true });
      expect(september.pillars.length).toBeGreaterThan(0);
      expect(response.body[1]).toMatchObject({
        period: 'August 2026',
        quarter: null,
      });
    });

    it('are for the Strategy Office only', async () => {
      expect((await call(HASSAN, 'get', '/reports/snapshots')).status).toBe(
        403,
      );
    });
  });

  describe('preview', () => {
    it('assembles a Board pack from the snapshot, with page count', async () => {
      const response = await call(AMARA, 'post', '/reports/preview', board());

      expect(response.status).toBe(200);
      const pack = response.body;
      expect(pack).toMatchObject({
        title: 'Q3 2026 Board pack',
        template: 'QUARTERLY_BOARD',
        audience: 'BOARD',
        period: 'September 2026',
        organisation: 'Meridian Financial Group',
      });
      expect(pack.sections.map((s: Section) => s.key)).toEqual(
        board().sections,
      );
      expect(pack.pageCount).toBe(
        1 +
          pack.sections.reduce(
            (n: number, s: { pages: number }) => n + s.pages,
            0,
          ),
      );
      expect(sectionOf(pack, 'executive_summary')).toMatchObject({
        narrative:
          'Execution is broadly on plan; digital delivery is slipping.',
        headline: { initiatives: 32, kpisTotal: 18 },
      });
      expect(sectionOf(pack, 'decisions').title).toBe(
        'Decisions required from the Board',
      );
      expect(sectionOf(pack, 'benefits')).toMatchObject({
        currency: 'NGN',
        year: 2026,
        realisedToDate: 1_900_000_000,
      });
    });

    it('summarises sensitive initiatives at pillar level for the Board, not for EXCO', async () => {
      const forBoard = (await call(AMARA, 'post', '/reports/preview', board()))
        .body;
      expect(forBoard.sensitiveSummarised).toBe(2);
      const named = (forBoard.sections as Section[]).flatMap(
        (s) => JSON.stringify(s).match(/OPS-00[45]/g) ?? [],
      );
      expect(named).toEqual([]);

      const forExco = (
        await call(
          AMARA,
          'post',
          '/reports/preview',
          board({ audience: 'EXCO', sections: ['exceptions'] }),
        )
      ).body;
      expect(forExco.sensitiveSummarised).toBe(0);
      const codes = (
        sectionOf(forExco, 'exceptions').initiatives as { code: string }[]
      ).map((i) => i.code);
      expect(codes.filter((c) => SENSITIVE.includes(c)).length).toBeGreaterThan(
        0,
      );
    });

    it('builds a pillar deep dive for one pillar', async () => {
      const pillar = september.pillars[0]!;
      const response = await call(AMARA, 'post', '/reports/preview', {
        snapshotId: september.id,
        template: 'PILLAR_DEEP_DIVE',
        audience: 'EXCO',
        sections: ['pillar_overview', 'pillar_kpis', 'pillar_initiatives'],
        scopeElementId: pillar.id,
      });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe(
        `${pillar.title} deep dive, September 2026`,
      );
      expect(sectionOf(response.body, 'pillar_overview')).toMatchObject({
        pillar: { code: pillar.code },
      });
      expect(
        (sectionOf(response.body, 'pillar_kpis').kpis as unknown[]).length,
      ).toBeGreaterThan(0);
    });

    it('checks the definition', async () => {
      const wrongSection = await call(
        AMARA,
        'post',
        '/reports/preview',
        board({ sections: ['pillar_kpis'] }),
      );
      expect(wrongSection.status).toBe(400);
      expect(wrongSection.body.errors[0]).toMatchObject({
        path: 'sections.0',
        message: 'Pillar KPIs is not part of this template',
      });

      const noPillar = await call(AMARA, 'post', '/reports/preview', {
        snapshotId: september.id,
        template: 'PILLAR_DEEP_DIVE',
        audience: 'EXCO',
        sections: ['pillar_overview'],
      });
      expect(noPillar.status).toBe(400);
      expect(noPillar.body.errors[0].path).toBe('scopeElementId');

      const notAPillar = await call(AMARA, 'post', '/reports/preview', {
        snapshotId: september.id,
        template: 'PILLAR_DEEP_DIVE',
        audience: 'EXCO',
        sections: ['pillar_overview'],
        scopeElementId: '00000000-0000-7000-8000-000000000000',
      });
      expect(notAPillar.status).toBe(400);
      expect(notAPillar.body.errors[0].message).toBe(
        'Choose a pillar of this snapshot',
      );
    });

    it('refuses snapshots taken before packs could be built', async () => {
      const { rows } = await admin.query(
        `INSERT INTO "ReportSnapshot" (id, "organisationId", "periodId", kind, data)
         SELECT gen_random_uuid(), "organisationId", id, 'PERIOD_LOCK', '{"period":"January 2026","initiatives":30}'
         FROM "ReportingPeriod" WHERE name = 'January 2026' RETURNING id`,
      );
      const listed = (await call(AMARA, 'get', '/reports/snapshots')).body.find(
        (s: { id: string }) => s.id === rows[0].id,
      );
      expect(listed).toMatchObject({ usable: false, pillars: [] });

      const response = await call(
        AMARA,
        'post',
        '/reports/preview',
        board({ snapshotId: rows[0].id }),
      );
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('SNAPSHOT_TOO_OLD');
    });
  });

  describe('requesting packs', () => {
    it('queues a pack with its definition', async () => {
      const response = await call(AMARA, 'post', '/reports/packs', {
        ...board(),
        formats: ['PDF', 'PPTX'],
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        title: 'Q3 2026 Board pack',
        template: 'QUARTERLY_BOARD',
        audience: 'BOARD',
        period: 'September 2026',
        snapshotId: september.id,
        formats: ['PDF', 'PPTX'],
        status: 'QUEUED',
        version: '1.0',
        available: [],
        issuedAt: null,
        requestedBy: { name: expect.any(String) },
      });
      const audit = await admin.query(
        `SELECT action FROM "AuditEvent" WHERE "entityId" = $1`,
        [response.body.id],
      );
      expect(audit.rows.map((r) => r.action)).toEqual([
        'REPORT_PACK_REQUESTED',
      ]);
    });

    it('gives a repeat of a cycle and template the next version', async () => {
      const response = await call(AMARA, 'post', '/reports/packs', {
        snapshotId: september.id,
        template: 'MONTHLY_MANAGEMENT',
        audience: 'EXCO',
        sections: ['executive_summary', 'exceptions'],
        title: 'September management report (corrected)',
        formats: ['PDF'],
      });
      // The seeded September report is 1.0.
      expect(response.body).toMatchObject({
        title: 'September management report (corrected)',
        version: '1.1',
      });
    });

    it('needs at least one format', async () => {
      const response = await call(AMARA, 'post', '/reports/packs', {
        ...board(),
        formats: [],
      });
      expect(response.status).toBe(400);
    });
  });

  describe('reading packs', () => {
    it('lists every pack, newest first, for the Strategy Office', async () => {
      const { body } = await call(AMARA, 'get', '/reports/packs');
      expect(body.map((p: { title: string }) => p.title)).toEqual([
        'September management report (corrected)',
        'Q3 2026 Board pack',
        'September management report',
        'August management report',
        'Q2 2026 Board pack',
      ]);
      expect(body[2]).toMatchObject({
        status: 'READY',
        available: ['PDF'],
        issuedAt: expect.stringMatching(/^2026-10-08/),
      });
    });

    it('shows Board members the Board’s packs only', async () => {
      const { body } = await call(CHAIR, 'get', '/reports/packs');
      expect(body.map((p: { title: string }) => p.title)).toEqual([
        'Q3 2026 Board pack',
        'Q2 2026 Board pack',
      ]);
      const excoPack = (await call(AMARA, 'get', '/reports/packs')).body[0];
      expect(
        (await call(CHAIR, 'get', `/reports/packs/${excoPack.id}`)).status,
      ).toBe(404);
    });

    it('keeps packs from people without a reporting role', async () => {
      expect((await call(HASSAN, 'get', '/reports/packs')).status).toBe(403);
    });
  });
});
