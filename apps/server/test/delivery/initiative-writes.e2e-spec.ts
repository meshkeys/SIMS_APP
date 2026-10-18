import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { emailFor } from '../../prisma/seed/demo/people.js';
import { CLOCK, FixedClock } from '../../src/common/clock/clock.js';
import { createAdminPool } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';
import { loadDemo, signInAs } from '../setup/demo.js';

const AMARA = emailFor('strategyHead'); // Strategy Office
const HASSAN = emailFor('headDigital'); // initiative owner (DIG-004)
const COO = emailFor('coo'); // sponsor of other initiatives
const NKECHI = emailFor('productManager'); // task owner

const DEMO_NOW = new Date('2026-10-16T09:00:00Z');

describe('Initiative changes (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  let token: ReturnType<typeof signInAs>;
  const clock = new FixedClock(DEMO_NOW);
  const ids: Record<string, string> = {};
  const elements: Record<string, string> = {};
  const people: Record<string, string> = {};
  let robo: { id: string; milestones: { id: string; title: string }[] };

  const call = async (
    as: string,
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    path: string,
    body?: object,
  ) => {
    const bearer = await token(as);
    return request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .auth(bearer, { type: 'bearer' })
      .send(body);
  };

  beforeAll(async () => {
    admin = createAdminPool();
    await loadDemo(admin);
    app = await createTestApp({
      overrides: [{ provide: CLOCK, useValue: clock }],
    });
    token = signInAs(app);
    for (const row of (await admin.query(`SELECT code, id FROM "Initiative"`))
      .rows)
      ids[row.code] = row.id;
    for (const row of (
      await admin.query(`SELECT code, id FROM "StrategyElement"`)
    ).rows)
      elements[row.code] = row.id;
    for (const row of (
      await admin.query(
        `SELECT u.email, m.id FROM "Membership" m JOIN "User" u ON u.id = m."userId"`,
      )
    ).rows)
      people[row.email] = row.id;
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  describe('proposing', () => {
    it('lets an initiative owner propose, with a code suggested from the pillar', async () => {
      const response = await call(HASSAN, 'post', '/initiatives', {
        title: 'Robo-advisory Service',
        description: 'Automated portfolio advice for retail investors.',
        objectives: [
          { elementId: elements['O2.1'], weight: 10, isPrimary: true },
          { elementId: elements['O1.1'], weight: 5 },
        ],
        sponsorId: people[emailFor('edBusiness')],
        baselineStart: '2026-11-01',
        baselineEnd: '2027-06-30',
        baselineBudget: 250_000_000,
      });

      expect(response.status).toBe(201);
      robo = response.body;
      expect(response.body).toMatchObject({
        code: 'DIG-016',
        status: 'PROPOSED',
        // The proposer becomes the owner when none is named.
        owner: { name: 'Hassan Danjuma' },
        pillar: { code: 'P2' },
      });
      const pipeline = await call(AMARA, 'get', '/initiatives?tab=pipeline');
      expect(pipeline.body.tabCounts.pipeline).toBe(6);
    });

    it('requires exactly one primary objective from the plan', async () => {
      const twoPrimaries = await call(HASSAN, 'post', '/initiatives', {
        title: 'Two homes',
        objectives: [
          { elementId: elements['O2.1'], weight: 10, isPrimary: true },
          { elementId: elements['O1.1'], weight: 5, isPrimary: true },
        ],
      });
      expect(twoPrimaries.status).toBe(400);

      const unknown = await call(HASSAN, 'post', '/initiatives', {
        title: 'Nowhere',
        objectives: [
          {
            elementId: '0199f0a0-0000-7000-8000-00000000dead',
            weight: 10,
            isPrimary: true,
          },
        ],
      });
      expect(unknown.status).toBe(400);
      expect(unknown.body.errors[0].path).toBe('objectives.0.elementId');
    });

    it('lets the owner plan milestones while it is in the pipeline', async () => {
      const first = await call(
        HASSAN,
        'post',
        `/initiatives/${robo.id}/milestones`,
        {
          title: 'Advice engine built',
          weight: 60,
          isCritical: true,
          baselineStartDate: '2026-11-01',
          baselineDate: '2027-03-31',
        },
      );
      expect(first.status).toBe(201);
      const second = await call(
        HASSAN,
        'post',
        `/initiatives/${robo.id}/milestones`,
        {
          title: 'Launched to retail customers',
          weight: 40,
          baselineStartDate: '2027-04-01',
          baselineDate: '2027-06-30',
        },
      );
      robo = second.body;
      expect(robo.milestones.map((m) => m.title)).toEqual([
        'Advice engine built',
        'Launched to retail customers',
      ]);
    });
  });

  describe('lifecycle', () => {
    it('is changed only by the Strategy Office', async () => {
      const response = await call(
        HASSAN,
        'post',
        `/initiatives/${robo.id}/status`,
        { status: 'APPROVED' },
      );
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('STRATEGY_OFFICE_ONLY');
    });

    it('refuses skipping approval', async () => {
      const response = await call(
        AMARA,
        'post',
        `/initiatives/${robo.id}/status`,
        { status: 'ACTIVE' },
      );
      expect(response.status).toBe(409);
      expect(response.body.detail).toContain('APPROVED');
    });

    it('lists what is missing before activation', async () => {
      const bare = await call(AMARA, 'post', '/initiatives', {
        title: 'Bare idea',
        status: 'DRAFT',
        objectives: [
          { elementId: elements['O3.1'], weight: 5, isPrimary: true },
        ],
      });
      await call(AMARA, 'post', `/initiatives/${bare.body.id}/status`, {
        status: 'PROPOSED',
      });
      await call(AMARA, 'post', `/initiatives/${bare.body.id}/status`, {
        status: 'APPROVED',
      });
      const response = await call(
        AMARA,
        'post',
        `/initiatives/${bare.body.id}/status`,
        { status: 'ACTIVE' },
      );

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('NOT_READY');
      expect(
        response.body.errors.map((e: { message: string }) => e.message),
      ).toEqual([
        'Assign an initiative owner',
        'Assign an executive sponsor',
        'Set baseline start and end dates',
        'Add at least one milestone with a weight',
      ]);
    });

    it('activates a ready initiative and calculates its health', async () => {
      await call(AMARA, 'post', `/initiatives/${robo.id}/status`, {
        status: 'APPROVED',
      });
      const response = await call(
        AMARA,
        'post',
        `/initiatives/${robo.id}/status`,
        { status: 'ACTIVE' },
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ACTIVE',
        execution: { verified: 0, planned: 0 },
        health: {
          calculated: 'GREEN',
          reasons: [{ rule: 'PROGRESS_VS_PLAN', detail: 'On plan' }],
        },
      });
      expect(
        (await call(AMARA, 'get', '/initiatives')).body.tabCounts.active,
      ).toBe(33);
    });
  });

  describe('once active, the baseline is locked', () => {
    it('for the owner: no new milestones, weights or baseline dates', async () => {
      const add = await call(
        HASSAN,
        'post',
        `/initiatives/${robo.id}/milestones`,
        {
          title: 'Extra',
          weight: 10,
          baselineDate: '2027-05-01',
        },
      );
      expect(add.status).toBe(409);
      expect(add.body.code).toBe('BASELINE_LOCKED');

      const end = await call(HASSAN, 'patch', `/initiatives/${robo.id}`, {
        baselineEnd: '2027-09-30',
      });
      expect(end.status).toBe(409);
    });

    it('but forecasts and the narrative stay open, with the forecast move in the trail', async () => {
      const milestone = robo.milestones[0];
      const forecast = await call(
        HASSAN,
        'patch',
        `/milestones/${milestone.id}`,
        { forecastDate: '2027-04-15' },
      );
      expect(forecast.status).toBe(200);
      expect(forecast.body.activity[0].summary).toBe(
        'Forecast for Advice engine built moved  → 15 Apr',
      );

      const narrative = await call(HASSAN, 'patch', `/initiatives/${robo.id}`, {
        description: 'Updated scope.',
      });
      expect(narrative.status).toBe(200);
    });

    it('owners cannot reassign accountability', async () => {
      const response = await call(HASSAN, 'patch', `/initiatives/${robo.id}`, {
        sponsorId: people[COO],
        priority: 1,
      });
      expect(response.status).toBe(403);
      expect(response.body.errors.map((e: { path: string }) => e.path)).toEqual(
        ['sponsorId', 'priority'],
      );
    });

    it('even for the Strategy Office: changes go through a change request', async () => {
      const response = await call(AMARA, 'patch', `/initiatives/${robo.id}`, {
        baselineEnd: '2027-07-31',
      });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('BASELINE_LOCKED');
      expect(response.body.detail).toContain('change request');

      const dig004 = (
        await call(AMARA, 'get', `/initiatives/${ids['DIG-004']}`)
      ).body;
      const vendor = dig004.milestones.find(
        (m: { title: string }) => m.title === 'Vendor contract signed',
      );
      const critical = await call(AMARA, 'patch', `/milestones/${vendor.id}`, {
        isCritical: false,
      });
      expect(critical.status).toBe(409);
      const removal = await call(AMARA, 'delete', `/milestones/${vendor.id}`);
      expect(removal.status).toBe(409);
    });
  });

  describe('tasks', () => {
    it('are managed by the owner; the assignee updates the status', async () => {
      const milestone = robo.milestones[0];
      const added = await call(
        HASSAN,
        'post',
        `/milestones/${milestone.id}/tasks`,
        {
          title: 'Risk-profiling questionnaire',
          assigneeId: people[NKECHI],
          dueDate: '2026-12-15',
        },
      );
      expect(added.status).toBe(201);
      const task = added.body.milestones[0].tasks[0];
      expect(task).toMatchObject({
        status: 'TODO',
        assignee: { name: 'Nkechi Ibe' },
      });

      const done = await call(NKECHI, 'patch', `/tasks/${task.id}`, {
        status: 'DONE',
      });
      expect(done.status).toBe(200);
      expect(done.body.milestones[0].tasks[0]).toMatchObject({
        status: 'DONE',
        completedAt: DEMO_NOW.toISOString(),
      });

      const rename = await call(NKECHI, 'patch', `/tasks/${task.id}`, {
        title: 'Renamed',
      });
      expect(rename.status).toBe(403);
    });
  });

  describe('dependencies', () => {
    it('records what an initiative waits on and starts the blocked clock', async () => {
      const response = await call(
        HASSAN,
        'post',
        `/initiatives/${robo.id}/dependencies`,
        {
          toInitiativeId: ids['DIG-004'],
          status: 'BLOCKED',
          isCriticalPath: true,
        },
      );
      expect(response.status).toBe(201);
      expect(response.body.dependencies.blockedBy).toEqual([
        expect.objectContaining({
          code: 'DIG-004',
          status: 'BLOCKED',
          blockedSince: '2026-10-16',
        }),
      ]);

      const duplicate = await call(
        HASSAN,
        'post',
        `/initiatives/${robo.id}/dependencies`,
        { toInitiativeId: ids['DIG-004'] },
      );
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe('DEPENDENCY_EXISTS');
    });

    it('refuses a loop, naming it', async () => {
      // DIG-016 waits on DIG-004, which waits on DIG-011.
      const response = await call(
        AMARA,
        'post',
        `/initiatives/${ids['DIG-011']}/dependencies`,
        {
          toInitiativeId: robo.id,
        },
      );
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('DEPENDENCY_CYCLE');
      expect(response.body.detail).toContain(
        'DIG-011 → DIG-016 → DIG-004 → DIG-011',
      );
    });

    it('caps health at Amber once blocked for 14 days', async () => {
      clock.set(new Date('2026-11-01T09:00:00Z'));
      const robo2 = (await call(AMARA, 'get', `/initiatives/${robo.id}`)).body;
      const dependency = robo2.dependencies.blockedBy[0];
      // Any change re-runs the rules at the current date.
      const response = await call(HASSAN, 'patch', `/initiatives/${robo.id}`, {
        description: 'Still waiting.',
      });
      expect(response.body.health.calculated).toBe('AMBER');
      expect(
        response.body.health.reasons.map((r: { detail: string }) => r.detail),
      ).toContain(
        'Blocked for 16 days by DIG-004 Launch Digital Investment Platform',
      );
      expect(dependency.code).toBe('DIG-004');
      clock.set(DEMO_NOW);
    });
  });

  describe('access', () => {
    it('refuses people not accountable for the initiative', async () => {
      const response = await call(
        COO,
        'patch',
        `/initiatives/${ids['DIG-004']}`,
        { description: 'x' },
      );
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('NOT_ACCOUNTABLE');
    });

    it('answers 404 for sensitive initiatives the caller cannot see', async () => {
      const response = await call(
        HASSAN,
        'patch',
        `/initiatives/${ids['OPS-005']}`,
        { description: 'x' },
      );
      expect(response.status).toBe(404);
    });

    it('lets only the Strategy Office change objective links', async () => {
      const objectives = [
        { elementId: elements['O2.2'], weight: 15, isPrimary: true },
      ];
      expect(
        (
          await call(HASSAN, 'put', `/initiatives/${robo.id}/objectives`, {
            objectives,
          })
        ).status,
      ).toBe(403);
      const response = await call(
        AMARA,
        'put',
        `/initiatives/${robo.id}/objectives`,
        { objectives },
      );
      expect(response.status).toBe(200);
      expect(response.body.contributesTo).toEqual([
        expect.objectContaining({ code: 'O2.2', weight: 15, isPrimary: true }),
      ]);
    });
  });

  describe('closing', () => {
    it('requires a reason, then records the actual end date', async () => {
      const noReason = await call(
        AMARA,
        'post',
        `/initiatives/${robo.id}/status`,
        { status: 'CLOSED' },
      );
      expect(noReason.status).toBe(400);
      expect(noReason.body.errors[0].path).toBe('reason');

      const closed = await call(
        AMARA,
        'post',
        `/initiatives/${robo.id}/status`,
        {
          status: 'CLOSED',
          reason: 'Merged into the wealth platform programme.',
        },
      );
      expect(closed.status).toBe(200);
      expect(closed.body).toMatchObject({
        status: 'CLOSED',
        actualEnd: '2026-10-16',
      });

      const reopen = await call(
        AMARA,
        'post',
        `/initiatives/${robo.id}/status`,
        { status: 'ACTIVE' },
      );
      expect(reopen.status).toBe(409);
    });

    it('leaves a complete audit trail', async () => {
      const { rows } = await admin.query(
        `SELECT action FROM "AuditEvent" WHERE "entityId" = $1 ORDER BY "createdAt", action`,
        [robo.id],
      );
      expect(rows.map((r) => r.action)).toEqual(
        expect.arrayContaining([
          'INITIATIVE_PROPOSED',
          'STATUS_CHANGED',
          'DEPENDENCY_ADDED',
          'OBJECTIVES_CHANGED',
        ]),
      );
    });
  });
});
