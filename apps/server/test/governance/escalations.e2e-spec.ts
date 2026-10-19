import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { emailFor } from '../../prisma/seed/demo/people.js';
import { CLOCK, FixedClock } from '../../src/common/clock/clock.js';
import { createAdminPool } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';
import { loadDemo, signInAs } from '../setup/demo.js';

const AMARA = emailFor('strategyHead'); // Strategy Office
const CEO = emailFor('ceo');
const OLU = emailFor('headCompliance'); // owns nothing relevant here

const DEMO_NOW = new Date('2026-10-16T09:00:00Z');
const DAY = 86_400_000;

interface Item {
  id: string;
  reference: string;
  title: string;
  level: number;
  levelName: string;
  ageDays: number;
  nextLevelInDays: number | null;
  decisionFrom: { name: string } | null;
  decisionFromRole: string | null;
  initiative: { code: string } | null;
  can: {
    escalate: boolean;
    deEscalate: boolean;
    resolve: boolean;
    withdraw: boolean;
  };
}

describe('Escalations (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  let token: ReturnType<typeof signInAs>;
  const clock = new FixedClock(DEMO_NOW);
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());

  const call = async (
    as: string,
    method: 'get' | 'post',
    path: string,
    body?: object,
  ) => {
    const bearer = await token(as);
    return http()
      [method](`/api/v1${path}`)
      .auth(bearer, { type: 'bearer' })
      .send(body);
  };
  const centre = async (as = AMARA, query = '') =>
    (await call(as, 'get', `/escalations${query}`)).body as {
      ladder: { level: number; name: string; open: number }[];
      items: Item[];
      total: number;
      can: { raisePortfolio: boolean };
    };
  const itemTitled = async (title: string, as = AMARA) =>
    (await centre(as)).items.find((i) => i.title === title)!;
  /** Email of an initiative's owner or sponsor. */
  const personOf = async (code: string, role: 'ownerId' | 'sponsorId') =>
    (
      await admin.query(
        `SELECT u.email FROM "Initiative" i
           JOIN "Membership" m ON m.id = i."${role}"
           JOIN "User" u ON u.id = m."userId"
         WHERE i.code = $1`,
        [code],
      )
    ).rows[0].email as string;

  beforeAll(async () => {
    admin = createAdminPool();
    await loadDemo(admin);
    app = await createTestApp({
      overrides: [{ provide: CLOCK, useValue: clock }],
    });
    token = signInAs(app);
    const rows = await admin.query(
      `SELECT code, id FROM "Initiative" UNION ALL SELECT title, id FROM "RiskIssue"`,
    );
    for (const row of rows.rows) ids[row.code] = row.id;
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  describe('the escalation centre', () => {
    it('shows the ladder with open counts and items oldest first', async () => {
      const body = await centre();

      expect(body.ladder.map((l) => [l.level, l.name, l.open])).toEqual([
        [1, 'Initiative owner', 9],
        [2, 'Executive sponsor', 5],
        [3, 'MD/CEO · EXCO', 2],
        [4, 'Board', 0],
      ]);
      expect(body.total).toBe(16);
      expect(body.items[0]).toMatchObject({
        title: 'Core banking API dependency blocking onboarding go-live',
        level: 3,
        levelName: 'MD/CEO · EXCO',
        ageDays: 21,
        decisionFromRole: 'CEO',
        initiative: { code: 'DIG-007' },
        // The Board is reached only by decision.
        nextLevelInDays: null,
      });
      const ages = body.items.map((i) => i.ageDays);
      expect(ages).toEqual([...ages].sort((a, b) => b - a));
      expect(body.can.raisePortfolio).toBe(true);
    });

    it('says when an item will move up on its own', async () => {
      // Raised 6 days ago at level 1: level 2 is due after 7 days.
      expect(
        await itemTitled('No KPI actuals submitted for two periods'),
      ).toMatchObject({ level: 1, nextLevelInDays: 1 });
    });

    it('shows the level history', async () => {
      const item = await itemTitled(
        'Shared data engineering team over-allocated',
      );
      const { body } = await call(AMARA, 'get', `/escalations/${item.id}`);

      expect(
        body.history.map((h: { toLevel: number; reason: string }) => [
          h.toLevel,
          h.reason,
        ]),
      ).toEqual([
        [1, 'RAISED'],
        [2, 'AUTO_TIMEOUT'],
        [3, 'AUTO_TIMEOUT'],
      ]);
      expect(body.history[1].actor).toBeNull();
    });

    it('lists resolved items on request', async () => {
      const body = await centre(AMARA, '?status=RESOLVED');
      expect(body.items.map((i) => i.title)).toEqual(
        expect.arrayContaining(['Category spend data incomplete']),
      );
      expect(body.items.every((i) => !i.can.resolve)).toBe(true);
    });

    it('lists blocked and at-risk dependencies, blocked first', async () => {
      const { body } = await call(OLU, 'get', '/dependencies');

      expect(
        body.map(
          (d: {
            from: { code: string };
            to: { code: string };
            status: string;
          }) => [d.from.code, d.to.code, d.status],
        ),
      ).toEqual([
        ['DIG-007', 'DIG-011', 'BLOCKED'],
        ['DIG-004', 'DIG-011', 'BLOCKED'],
        ['REV-005', 'DIG-004', 'AT_RISK'],
      ]);
      expect(body[0]).toMatchObject({
        isCriticalPath: true,
        blockedSince: '2026-09-25T00:00:00.000Z',
      });
    });
  });

  describe('raising', () => {
    it('lets an initiative owner raise one, starting with themselves', async () => {
      const owner = await personOf('CX-004', 'ownerId');
      const response = await call(owner, 'post', '/escalations', {
        title: 'Complaints vendor missed data migration window',
        severity: 'HIGH',
        initiativeId: ids['CX-004'],
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        reference: 'ESC-0019',
        level: 1,
        levelName: 'Initiative owner',
        source: 'MANUAL',
        status: 'OPEN',
        decisionFromRole: null,
        nextLevelInDays: 7,
        can: {
          escalate: true,
          deEscalate: false,
          resolve: true,
          withdraw: true,
        },
      });
      expect(response.body.decisionFrom.name).toBe(response.body.raisedBy.name);
      expect(response.body.history).toEqual([
        expect.objectContaining({
          fromLevel: null,
          toLevel: 1,
          reason: 'RAISED',
        }),
      ]);
    });

    it('starts critical items at the MD/CEO', async () => {
      const response = await call(AMARA, 'post', '/escalations', {
        title: 'Card scheme certification failed',
        severity: 'CRITICAL',
        initiativeId: ids['DIG-004'],
      });

      expect(response.body).toMatchObject({
        level: 3,
        decisionFromRole: 'CEO',
        decisionFrom: { name: expect.any(String) },
      });
      expect(response.body.history[0].reason).toBe('CRITICAL_SEVERITY');
    });

    it('keeps portfolio-level escalations for the Strategy Office', async () => {
      const denied = await call(OLU, 'post', '/escalations', {
        title: 'Shared services budget frozen',
        severity: 'MEDIUM',
      });
      expect(denied.status).toBe(403);

      const response = await call(AMARA, 'post', '/escalations', {
        title: 'Shared services budget frozen',
        severity: 'MEDIUM',
        source: 'RESOURCE_CONFLICT',
      });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        initiative: null,
        source: 'RESOURCE_CONFLICT',
        decisionFrom: null,
        decisionFromRole: 'STRATEGY_OFFICE',
      });
    });

    it('stops a risk being escalated twice', async () => {
      const response = await call(AMARA, 'post', '/escalations', {
        title: 'SEC approval again',
        severity: 'HIGH',
        riskIssueId: ids['SEC product approval may slip past launch date'],
      });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('ALREADY_ESCALATED');
    });

    it('stops people raising for initiatives they are not accountable for', async () => {
      const response = await call(OLU, 'post', '/escalations', {
        title: 'Complaints backlog',
        severity: 'LOW',
        initiativeId: ids['CX-004'],
      });
      expect(response.status).toBe(403);
    });
  });

  describe('moving and closing', () => {
    it('lets the decider move it up to the next level, with a reason', async () => {
      const item = await itemTitled(
        'Complaints vendor missed data migration window',
      );
      const owner = await personOf('CX-004', 'ownerId');

      const tooShort = await call(
        owner,
        'post',
        `/escalations/${item.id}/escalate`,
        {
          note: 'help',
        },
      );
      expect(tooShort.status).toBe(400);

      const denied = await call(
        OLU,
        'post',
        `/escalations/${item.id}/escalate`,
        {
          note: 'Needs the sponsor to approve extra spend',
        },
      );
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('NOT_DECIDER');

      const response = await call(
        owner,
        'post',
        `/escalations/${item.id}/escalate`,
        {
          note: 'Needs the sponsor to approve extra spend',
        },
      );
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        level: 2,
        levelName: 'Executive sponsor',
        daysAtLevel: 0,
      });
      expect(response.body.history.at(-1)).toMatchObject({
        fromLevel: 1,
        toLevel: 2,
        reason: 'MANUAL',
        note: 'Needs the sponsor to approve extra spend',
        actor: { name: expect.any(String) },
      });
      // The owner no longer decides.
      expect(response.body.can.resolve).toBe(false);
      const sponsor = await personOf('CX-004', 'sponsorId');
      expect((await itemTitled(item.title, sponsor)).can.resolve).toBe(true);
    });

    it('lets the Strategy Office move it back down', async () => {
      const item = await itemTitled(
        'Complaints vendor missed data migration window',
      );
      const response = await call(
        AMARA,
        'post',
        `/escalations/${item.id}/de-escalate`,
        {
          note: 'Owner can resolve with existing budget',
        },
      );

      expect(response.body).toMatchObject({ level: 1, nextLevelInDays: 7 });
      expect(response.body.history.at(-1).reason).toBe('DE_ESCALATED');
    });

    it('cannot go past the top or below the first level', async () => {
      const bottom = await itemTitled(
        'Treasury dealer hires awaiting approval',
      );
      const response = await call(
        AMARA,
        'post',
        `/escalations/${bottom.id}/de-escalate`,
        {
          note: 'Trying to go below level one',
        },
      );
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('BOTTOM_OF_LADDER');
    });

    it('lets the MD/CEO resolve an item at their level', async () => {
      const item = await itemTitled(
        'Shared data engineering team over-allocated',
      );
      expect((await itemTitled(item.title, CEO)).can).toMatchObject({
        escalate: true,
        resolve: true,
      });

      const response = await call(
        CEO,
        'post',
        `/escalations/${item.id}/resolve`,
        {
          resolution:
            'EXCO re-prioritised the data team to DIG-011 for six weeks.',
        },
      );
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'RESOLVED',
        resolution:
          'EXCO re-prioritised the data team to DIG-011 for six weeks.',
        nextLevelInDays: null,
        can: { escalate: false, resolve: false, withdraw: false },
      });

      const again = await call(CEO, 'post', `/escalations/${item.id}/resolve`, {
        resolution: 'Resolving it a second time',
      });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('ESCALATION_CLOSED');
      expect((await centre()).ladder[2]!.open).toBe(2); // 2 seeded − 1 + the critical raised above
    });

    it('lets whoever raised it withdraw it', async () => {
      const item = await itemTitled(
        'Complaints vendor missed data migration window',
      );
      const owner = await personOf('CX-004', 'ownerId');
      const response = await call(
        owner,
        'post',
        `/escalations/${item.id}/withdraw`,
        {
          reason: 'Vendor recovered the window overnight',
        },
      );
      expect(response.body.status).toBe('WITHDRAWN');

      const audit = await admin.query(
        `SELECT action FROM "AuditEvent" WHERE "entityId" = $1 ORDER BY "createdAt"`,
        [item.id],
      );
      expect(audit.rows.map((r) => r.action)).toEqual([
        'ESCALATION_RAISED',
        'ESCALATED',
        'DE_ESCALATED',
        'ESCALATION_WITHDRAWN',
      ]);
    });
  });

  describe('automatic moves', () => {
    it('moves unresolved items up when their time comes, dated when it fell due', async () => {
      const before = await centre();
      clock.set(new Date(DEMO_NOW.getTime() + 2 * DAY));

      const after = await centre();

      // Level 1 items 5+ days old reach day 7; a level 2 item 12 days old reaches day 14.
      const moved = (title: string) =>
        [before, after].map(
          (c) => c.items.find((i) => i.title === title)!.level,
        );
      expect(moved('No KPI actuals submitted for two periods')).toEqual([1, 2]);
      expect(moved('Test environment unavailable for two weeks')).toEqual([
        1, 2,
      ]);
      expect(moved('Correspondent bank onboarding stalled')).toEqual([2, 3]);
      expect(moved('October update not submitted')).toEqual([1, 1]);

      const item = after.items.find(
        (i) => i.title === 'No KPI actuals submitted for two periods',
      )!;
      const { body } = await call(AMARA, 'get', `/escalations/${item.id}`);
      expect(body.history.at(-1)).toMatchObject({
        fromLevel: 1,
        toLevel: 2,
        reason: 'AUTO_TIMEOUT',
        actor: null,
      });
      // Recorded on the day it fell due (raised 6 days before DEMO_NOW, + 7).
      expect(body.history.at(-1).at.slice(0, 10)).toBe('2026-10-17');
      expect(body).toMatchObject({ daysAtLevel: 1, decisionFromRole: null });
    });

    it('does nothing more when swept again', async () => {
      const response = await call(AMARA, 'post', '/escalations/sweep');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ moved: 0 });
      expect((await call(OLU, 'post', '/escalations/sweep')).status).toBe(403);
    });
  });
});
