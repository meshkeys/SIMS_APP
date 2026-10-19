import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { emailFor } from '../../prisma/seed/demo/people.js';
import { CLOCK, FixedClock } from '../../src/common/clock/clock.js';
import { createAdminPool } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';
import { loadDemo, signInAs } from '../setup/demo.js';

const AMARA = emailFor('strategyHead'); // Strategy Office + admin: proposes
const ANALYST = emailFor('strategyAnalyst'); // Strategy Office
const CEO = emailFor('ceo'); // approves
const HASSAN = emailFor('headDigital'); // initiative owner

const DEMO_NOW = new Date('2026-10-16T09:00:00Z');

describe('Rulesets (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  let token: ReturnType<typeof signInAs>;
  // The live rules, read once, as the base for every proposal.
  let live: Record<string, any>;

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
  const withChanges = (change: (config: Record<string, any>) => void) => {
    const config = structuredClone(live);
    change(config);
    return config;
  };
  const decisionFor = async (version: number) =>
    (await call(CEO, 'get', '/decisions?view=open')).body.items.find(
      (d: { title: string }) =>
        d.title.startsWith(`Approve rule change v${version}`),
    );

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

  describe('reading', () => {
    it('shows the active version, what it changed, and the history', async () => {
      const response = await call(AMARA, 'get', '/rulesets');

      expect(response.status).toBe(200);
      live = response.body.active.config;
      expect(response.body).toMatchObject({
        active: {
          version: 4,
          status: 'ACTIVE',
          changeSummary:
            'Amber band tightened to 15 pp; missed updates show Unknown.',
          changes: ['Amber up to: 20 pp → 15 pp'],
          approvedBy: { name: expect.any(String) },
          effectiveFrom: expect.stringMatching(/^2026-01-12/),
        },
        pending: null,
        can: { propose: true },
      });
      expect(
        response.body.history.map((v: { version: number }) => v.version),
      ).toEqual([4, 3]);
    });

    it('is for the Strategy Office and the MD/CEO', async () => {
      const ceo = await call(CEO, 'get', '/rulesets');
      expect(ceo.status).toBe(200);
      expect(ceo.body.can.propose).toBe(false);
      expect((await call(HASSAN, 'get', '/rulesets')).status).toBe(403);
    });
  });

  describe('impact preview', () => {
    it('changes nothing when the rules are the same', async () => {
      const { body } = await call(AMARA, 'post', '/rulesets/preview', {
        config: live,
      });

      expect(body.changes).toEqual([]);
      expect(body.health.proposed).toEqual(body.health.live);
      expect(body.health.changes).toEqual([]);
      const total = Object.values(
        body.health.live as Record<string, number>,
      ).reduce((a, b) => a + b, 0);
      expect(total).toBe(body.health.initiatives);
      expect(body.lowValue.proposed).toBe(body.lowValue.live);
    });

    it('shows which initiatives and KPIs a looser rule would move', async () => {
      const { body } = await call(AMARA, 'post', '/rulesets/preview', {
        config: withChanges((c) => {
          c.rag.greenMaxPpBehind = 10;
          c.impact.onTrajectoryMinPct = 40;
          c.impact.slightlyBehindMinPct = 30;
          c.impact.lowValueThresholdPct = 30;
        }),
      });

      expect(body.changes).toEqual([
        'Green up to: 5 pp → 10 pp',
        'Low-value threshold: 50% → 30%',
        'KPI on trajectory from: 50% → 40%',
        'KPI slightly behind from: 40% → 30%',
      ]);
      expect(body.health.changes.length).toBeGreaterThan(0);
      // Only better: a wider Green band never makes anything worse.
      for (const change of body.health.changes) {
        expect(change).toMatchObject({ from: 'AMBER', to: 'GREEN' });
      }
      expect(body.health.proposed.GREEN).toBe(
        body.health.live.GREEN + body.health.changes.length,
      );
      expect(body.kpis.changes).toContainEqual({
        code: 'K01',
        name: 'Non-interest income share',
        from: 'SLIGHTLY_BEHIND',
        to: 'ON_TRAJECTORY',
      });
      expect(body.lowValue.proposed).toBeLessThan(body.lowValue.live);
    });

    it('checks the rules themselves', async () => {
      const response = await call(AMARA, 'post', '/rulesets/preview', {
        config: withChanges((c) => {
          c.rag.amberMaxPpBehind = 3;
        }),
      });
      expect(response.status).toBe(400);
      expect(response.body.errors[0]).toMatchObject({
        path: 'config.rag.amberMaxPpBehind',
        message: 'The Amber limit must be greater than the Green limit',
      });
    });
  });

  describe('maker-checker', () => {
    let k01Before: string;

    it('refuses a proposal that changes nothing', async () => {
      const response = await call(AMARA, 'post', '/rulesets', {
        config: live,
        changeSummary: 'Nothing new here at all',
      });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('NO_CHANGES');
    });

    it('saves a proposal as the next version and asks the MD/CEO to decide', async () => {
      k01Before = (
        await admin.query(`SELECT trajectory FROM "Kpi" WHERE code = 'K01'`)
      ).rows[0].trajectory;
      const response = await call(AMARA, 'post', '/rulesets', {
        config: withChanges((c) => {
          c.rag.greenMaxPpBehind = 10;
          c.impact.onTrajectoryMinPct = 40;
          c.impact.slightlyBehindMinPct = 30;
        }),
        changeSummary: 'Align Green with the FY2027 tolerance and KPI bands.',
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        version: 5,
        status: 'PENDING_APPROVAL',
        changes: [
          'Green up to: 5 pp → 10 pp',
          'KPI on trajectory from: 50% → 40%',
          'KPI slightly behind from: 40% → 30%',
        ],
        proposedBy: { name: expect.any(String) },
        approvedBy: null,
        decisionId: expect.any(String),
        can: { withdraw: true },
      });

      const decision = await decisionFor(5);
      expect(decision).toMatchObject({
        kind: 'RULE_CHANGE',
        requiredFrom: 'CEO',
        changeRequestId: null,
        canDecide: true,
        context: expect.stringContaining('Green up to: 5 pp → 10 pp'),
      });
      expect(decision.id).toBe(response.body.decisionId);
    });

    it('allows one proposal at a time', async () => {
      const response = await call(ANALYST, 'post', '/rulesets', {
        config: withChanges((c) => {
          c.overrides.expiryDays = 45;
        }),
        changeSummary: 'Longer overrides for the year-end freeze.',
      });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('RULESET_PENDING');
    });

    it('never lets the proposer approve their own rules', async () => {
      const decision = await decisionFor(5);
      const response = await call(
        AMARA,
        'post',
        `/decisions/${decision.id}/decide`,
        {
          outcome: 'APPROVED',
        },
      );
      expect(response.status).toBe(403);
    });

    it('applies approved rules at once, recalculating health and KPIs', async () => {
      const preview = (
        await call(AMARA, 'post', '/rulesets/preview', {
          config: withChanges((c) => {
            c.rag.greenMaxPpBehind = 10;
            c.impact.onTrajectoryMinPct = 40;
            c.impact.slightlyBehindMinPct = 30;
          }),
        })
      ).body;
      const decision = await decisionFor(5);

      const response = await call(
        CEO,
        'post',
        `/decisions/${decision.id}/decide`,
        {
          outcome: 'APPROVED',
          notes: 'Agreed at EXCO on 15 October.',
        },
      );
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        outcome: 'APPROVED',
        kind: 'RULE_CHANGE',
      });

      const { body } = await call(AMARA, 'get', '/rulesets');
      expect(body.active).toMatchObject({
        version: 5,
        status: 'ACTIVE',
        approvedBy: { name: expect.any(String) },
        effectiveFrom: DEMO_NOW.toISOString(),
        decisionId: null,
      });
      expect(body.pending).toBeNull();
      expect(
        body.history.map(
          (v: { version: number; status: string }) =>
            `${v.version} ${v.status}`,
        ),
      ).toEqual(['5 ACTIVE', '4 SUPERSEDED', '3 SUPERSEDED']);

      // Each initiative the preview said would move has moved.
      const moved = preview.health.changes as { code: string; to: string }[];
      expect(moved.length).toBeGreaterThan(0);
      const { rows } = await admin.query(
        `SELECT code, "calculatedHealth" AS health, "rulesetVersion" FROM "Initiative" WHERE code = ANY($1)`,
        [moved.map((m) => m.code)],
      );
      for (const row of rows) {
        expect(row.health).toBe(moved.find((m) => m.code === row.code)!.to);
        expect(row.rulesetVersion).toBe(5);
      }
      expect(k01Before).toBe('SLIGHTLY_BEHIND');
      expect(
        (await admin.query(`SELECT trajectory FROM "Kpi" WHERE code = 'K01'`))
          .rows[0].trajectory,
      ).toBe('ON_TRAJECTORY');
      const audit = await admin.query(
        `SELECT action FROM "AuditEvent" WHERE "entityType" = 'Ruleset' ORDER BY "createdAt"`,
      );
      expect(audit.rows.map((r) => r.action)).toEqual(
        expect.arrayContaining(['RULESET_PROPOSED', 'RULESET_APPROVED']),
      );
    });

    it('lets the Strategy Office withdraw a proposal, closing its decision', async () => {
      const proposed = await call(ANALYST, 'post', '/rulesets', {
        config: withChanges((c) => {
          c.rag.greenMaxPpBehind = 10;
          c.impact.onTrajectoryMinPct = 40;
          c.impact.slightlyBehindMinPct = 30;
          c.overrides.expiryDays = 45;
        }),
        changeSummary: 'Longer overrides for the year-end freeze.',
      });
      expect(proposed.body).toMatchObject({
        version: 6,
        changes: ['Overrides expire after: 30 days → 45 days'],
      });

      const withdrawn = await call(
        AMARA,
        'post',
        `/rulesets/${proposed.body.id}/withdraw`,
      );
      expect(withdrawn.status).toBe(200);
      expect(withdrawn.body).toMatchObject({
        status: 'REJECTED',
        can: { withdraw: false },
      });
      expect(await decisionFor(6)).toBeUndefined();
      const again = await call(
        AMARA,
        'post',
        `/rulesets/${proposed.body.id}/withdraw`,
      );
      expect(again.status).toBe(409);
    });

    it('keeps the live rules when the MD/CEO rejects a proposal', async () => {
      await call(AMARA, 'post', '/rulesets', {
        config: withChanges((c) => {
          c.rag.greenMaxPpBehind = 10;
          c.impact.onTrajectoryMinPct = 40;
          c.impact.slightlyBehindMinPct = 30;
          c.healthModifiers.missedUpdateMakesUnknown = false;
        }),
        changeSummary: 'Stop showing Unknown for missed updates.',
      });
      const decision = await decisionFor(7);
      const response = await call(
        CEO,
        'post',
        `/decisions/${decision.id}/decide`,
        {
          outcome: 'REJECTED',
          notes: 'Stale statuses must not reach the Board.',
        },
      );
      expect(response.status).toBe(200);

      const { body } = await call(AMARA, 'get', '/rulesets');
      expect(body.active.version).toBe(5);
      expect(body.history[0]).toMatchObject({ version: 7, status: 'REJECTED' });
    });
  });
});
