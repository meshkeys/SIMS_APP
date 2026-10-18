import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { emailFor } from '../../prisma/seed/demo/people.js';
import { CLOCK, FixedClock } from '../../src/common/clock/clock.js';
import { createAdminPool } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';
import { loadDemo, signInAs } from '../setup/demo.js';

const AMARA = emailFor('strategyHead'); // Strategy Office
const HASSAN = emailFor('headDigital'); // owner of DIG-004
const AISHA = emailFor('headService'); // owner of CX-004 (October update not started)
const ED_BUSINESS = emailFor('edBusiness'); // sponsor of DIG-004
const COO = emailFor('coo');

const DEMO_NOW = new Date('2026-10-16T09:00:00Z');

interface Line {
  milestoneId: string;
  title: string;
  lastVerified: number;
  claimed: number | null;
  verified: number | null;
  locked: boolean;
  needsEvidence: boolean;
}

describe('Reporting cycle (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  let token: ReturnType<typeof signInAs>;
  const clock = new FixedClock(DEMO_NOW);
  const ids: Record<string, string> = {};
  let october: string;

  const call = async (
    as: string,
    method: 'get' | 'post' | 'put',
    path: string,
    body?: object,
  ) => {
    const bearer = await token(as);
    return request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .auth(bearer, { type: 'bearer' })
      .send(body);
  };
  const form = (as: string, code: string) =>
    call(as, 'get', `/periods/${october}/updates/${ids[code]}`);
  const updatePath = (code: string, action = '') =>
    `/periods/${october}/updates/${ids[code]}${action}`;

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
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  describe('the cycle tracker', () => {
    it('shows the October cycle as on the dashboard', async () => {
      const response = await call(HASSAN, 'get', '/periods/current');
      october = response.body.id;

      expect(response.body).toMatchObject({
        name: 'October 2026',
        status: 'SPONSOR_REVIEW',
        cycleDay: { day: 7, of: 8 },
        counts: {
          owed: 32,
          in: 29,
          outstanding: 3,
          challenged: 6,
          awaitingSponsor: 3,
          approved: 20,
        },
      });
    });
  });

  describe('owners', () => {
    it('see what they owe, most urgent first', async () => {
      const response = await call(HASSAN, 'get', '/my-updates');
      expect(response.body.period).toMatchObject({ name: 'October 2026' });
      expect(
        response.body.items.map(
          (i: { code: string; status: string }) => `${i.code} ${i.status}`,
        ),
      ).toEqual(['DIG-004 CHALLENGED', 'DIG-002 APPROVED', 'DIG-005 APPROVED']);
      expect(response.body.items[0].actionNeeded).toBe(true);
    });

    it('open the update form with live figures, checklist and the challenge thread', async () => {
      const { body } = await form(HASSAN, 'DIG-004');

      expect(body.update.status).toBe('CHALLENGED');
      expect(
        body.lines.map((l: Line) => [
          l.title,
          l.lastVerified,
          l.claimed,
          l.locked,
        ]),
      ).toEqual([
        ['Business case approved', 100, 100, true],
        ['Vendor contract signed', 0, 0, false],
        ['Technology development', 75, 95, false],
        ['Testing and deployment', 30, 48, false],
        ['Commercial launch', 0, 0, false],
      ]);
      expect(body.evaluation).toMatchObject({
        claimedCompletion: 70,
        healthPreview: 'RED',
      });
      expect(body.evaluation.plannedCompletion).toBeCloseTo(74, 0);
      expect(
        body.lines.find((l: Line) => l.title === 'Testing and deployment')
          .needsEvidence,
      ).toBe(true);
      expect(body.comments.map((c: { kind: string }) => c.kind)).toEqual([
        'CHALLENGE',
        'RESPONSE',
      ]);
      expect(body.can).toMatchObject({
        edit: true,
        submit: true,
        verify: false,
        approve: false,
      });
    });

    it('revise a challenged update and resubmit it', async () => {
      const { body } = await form(HASSAN, 'DIG-004');
      const lines = (body.lines as Line[])
        .filter((l) => !l.locked)
        .map((l) => ({
          milestoneId: l.milestoneId,
          claimedCompletion:
            l.title === 'Technology development'
              ? 85
              : l.title === 'Testing and deployment'
                ? 44
                : (l.claimed ?? 0),
        }));

      const response = await call(
        HASSAN,
        'post',
        updatePath('DIG-004', '/submit'),
        { lines },
      );
      expect(response.status).toBe(200);
      expect(response.body.update).toMatchObject({
        status: 'SUBMITTED',
        claimedProgress: 65,
      });
      expect(response.body.can).toMatchObject({ edit: false, submit: false });
    });

    it('cannot write someone else’s update', async () => {
      const response = await call(COO, 'put', updatePath('DIG-004'), {
        progressNarrative: 'Not mine to write.',
      });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('OWNER_ONLY');
    });
  });

  describe('a late update', () => {
    let lines: Line[];

    it('starts empty, with completed milestones locked at 100%', async () => {
      const { body } = await form(AISHA, 'CX-004');
      lines = body.lines;
      expect(body.update).toBeNull();
      expect(lines.map((l) => [l.claimed, l.locked])).toEqual([
        [100, true],
        [null, false],
        [null, false],
        [null, false],
      ]);
      expect(body.can.submit).toBe(false);
    });

    it('is refused while incomplete, listing what is missing', async () => {
      const response = await call(
        AISHA,
        'post',
        updatePath('CX-004', '/submit'),
        {
          lines: [{ milestoneId: lines[1].milestoneId, claimedCompletion: 50 }],
        },
      );
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('UPDATE_INCOMPLETE');
      expect(response.body.errors.map((e: { path: string }) => e.path)).toEqual(
        [
          'ALL_MILESTONES',
          'NARRATIVE',
          'VARIANCE_EXPLANATION',
          'RECOVERY_ACTION',
        ],
      );
    });

    it('goes in once complete, clearing the overdue flag', async () => {
      const response = await call(
        AISHA,
        'post',
        updatePath('CX-004', '/submit'),
        {
          lines: lines
            .filter((l) => !l.locked)
            .map((l, i) => ({
              milestoneId: l.milestoneId,
              claimedCompletion: i === 0 ? 50 : 0,
            })),
          progressNarrative:
            'Workflow configuration finished for retail complaints.',
          varianceExplanation:
            'Integration with the CRM was delayed by vendor capacity.',
          recoveryAction: 'Second vendor team onboarded from 20 October.',
        },
      );
      expect(response.status).toBe(200);
      expect(response.body.update.status).toBe('SUBMITTED');

      const detail = await call(AMARA, 'get', `/initiatives/${ids['CX-004']}`);
      expect(detail.body.health.updateOverdue).toBeNull();
      expect(
        (await call(AMARA, 'get', '/periods/current')).body.counts,
      ).toMatchObject({ in: 30, outstanding: 2 });
    });

    it('can be challenged; the owner’s reply is recorded as a response', async () => {
      const challenged = await call(
        AMARA,
        'post',
        updatePath('CX-004', '/challenge'),
        {
          comment:
            'Please attach the configuration sign-off for the build milestone.',
        },
      );
      expect(challenged.body.update.status).toBe('CHALLENGED');

      const reply = await call(
        AISHA,
        'post',
        updatePath('CX-004', '/comments'),
        { body: 'Uploading it today.' },
      );
      expect(reply.status).toBe(201);
      expect(reply.body.comments.map((c: { kind: string }) => c.kind)).toEqual([
        'CHALLENGE',
        'RESPONSE',
      ]);
    });
  });

  describe('verification and confirmation', () => {
    it('only the Strategy Office verifies, never above the claim', async () => {
      const { body } = await form(AMARA, 'DIG-004');
      const verifyAll = (overrides: Record<string, number>) =>
        (body.lines as Line[]).map((l) => ({
          milestoneId: l.milestoneId,
          verifiedCompletion: overrides[l.title] ?? l.claimed ?? 0,
        }));

      expect(
        (
          await call(HASSAN, 'post', updatePath('DIG-004', '/verify'), {
            lines: verifyAll({}),
          })
        ).status,
      ).toBe(403);

      const tooHigh = await call(
        AMARA,
        'post',
        updatePath('DIG-004', '/verify'),
        {
          lines: verifyAll({ 'Testing and deployment': 50 }),
        },
      );
      expect(tooHigh.status).toBe(400);
      expect(tooHigh.body.errors[0].message).toContain(
        'Cannot exceed the 44% claimed',
      );

      const verified = await call(
        AMARA,
        'post',
        updatePath('DIG-004', '/verify'),
        {
          lines: verifyAll({}),
          comment: 'Verified against the UAT log.',
        },
      );
      expect(verified.status).toBe(200);
      expect(verified.body.update).toMatchObject({
        status: 'REVIEWED',
        verifiedProgress: 65,
      });
    });

    it('the sponsor confirms (the owner cannot)', async () => {
      const byOwner = await call(
        HASSAN,
        'post',
        updatePath('DIG-004', '/approve'),
        {},
      );
      expect(byOwner.status).toBe(403);
      expect(byOwner.body.code).toBe('SPONSOR_ONLY');

      const bySponsor = await call(
        ED_BUSINESS,
        'post',
        updatePath('DIG-004', '/approve'),
        {},
      );
      expect(bySponsor.status).toBe(200);
      expect(bySponsor.body.update.status).toBe('APPROVED');
    });

    it('lists the review queue by status', async () => {
      const queue = await call(
        AMARA,
        'get',
        `/periods/${october}/updates?status=CHALLENGED`,
      );
      expect(queue.body.map((u: { code: string }) => u.code).sort()).toEqual([
        'CX-001',
        'CX-004',
        'DIG-009',
        'DIG-011',
        'DIG-013',
        'REV-006',
      ]);
      // A sponsor sees only their own initiatives.
      const sponsorView = await call(
        ED_BUSINESS,
        'get',
        `/periods/${october}/updates`,
      );
      expect(
        sponsorView.body.every((u: { code: string }) =>
          [
            'DIG-004',
            'REV-001',
            'REV-002',
            'REV-003',
            'REV-004',
            'REV-006',
            'REV-007',
            'REV-008',
          ].includes(u.code),
        ),
      ).toBe(true);
    });
  });

  describe('locking', () => {
    it('cannot open the next cycle while this one runs', async () => {
      const response = await call(AMARA, 'post', '/periods', {
        name: 'November 2026',
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        opensOn: '2026-11-09',
      });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('PERIOD_IN_PROGRESS');
    });

    it('refuses while updates are unfinished, naming them', async () => {
      const response = await call(
        AMARA,
        'post',
        `/periods/${october}/lock`,
        {},
      );
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('UPDATES_PENDING');
      expect(response.body.errors.map((e: { path: string }) => e.path)).toEqual(
        expect.arrayContaining(['CX-004', 'DIG-011', 'REV-007']),
      );
    });

    it('locks, approving sponsor-pending updates when asked, and freezes a snapshot', async () => {
      // Resolve the outstanding challenges (as the owners and Office would).
      await admin.query(
        `UPDATE "StatusUpdate" SET status = 'APPROVED' WHERE "periodId" = $1 AND status IN ('CHALLENGED', 'SUBMITTED')`,
        [october],
      );
      expect(
        (await call(AMARA, 'post', `/periods/${october}/lock`, {})).body.code,
      ).toBe('UPDATES_PENDING');

      const response = await call(AMARA, 'post', `/periods/${october}/lock`, {
        approveAwaitingSponsor: true,
      });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'LOCKED',
        lockedAt: DEMO_NOW.toISOString(),
        cycleDay: null,
      });

      const { rows } = await admin.query(
        `SELECT data->'totals' AS totals FROM "ReportSnapshot" WHERE "periodId" = $1 AND kind = 'PERIOD_LOCK'`,
        [october],
      );
      expect(rows[0].totals.initiatives).toBe(32);
    });

    it('turns initiatives that never reported Unknown, unless a hard fact forces Red', async () => {
      const rev005 = await call(AMARA, 'get', `/initiatives/${ids['REV-005']}`);
      expect(rev005.body.health.calculated).toBe('UNKNOWN');
      expect(rev005.body.health.reasons.at(-1).detail).toBe(
        'No update submitted for October 2026',
      );

      const dig007 = await call(AMARA, 'get', `/initiatives/${ids['DIG-007']}`);
      expect(dig007.body.health.calculated).toBe('RED');
    });

    it('accepts no more changes', async () => {
      const response = await call(HASSAN, 'put', updatePath('DIG-004'), {
        progressNarrative: 'Too late now.',
      });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('PERIOD_LOCKED');
    });
  });

  describe('the next cycle', () => {
    it('opens with deadlines in working days, closing 17:00 Lagos time', async () => {
      const response = await call(AMARA, 'post', '/periods', {
        name: 'November 2026',
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        opensOn: '2026-11-09',
      });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        status: 'OWNER_SUBMISSION',
        deadlines: {
          submissionDueAt: '2026-11-11T16:00:00.000Z', // working day 3
          strategyReviewDueAt: '2026-11-13T16:00:00.000Z', // day 5
          sponsorReviewDueAt: '2026-11-17T16:00:00.000Z', // day 7 (after a weekend)
          reportIssueDueAt: '2026-11-18T16:00:00.000Z', // day 8
        },
        counts: { owed: 32, in: 0, outstanding: 32 },
      });
    });

    it('moves stage by stage, then waits to be locked', async () => {
      const november = (await call(AMARA, 'get', '/periods/current')).body.id;
      expect(
        (await call(AMARA, 'post', `/periods/${november}/advance`)).body.status,
      ).toBe('STRATEGY_REVIEW');
      expect(
        (await call(AMARA, 'post', `/periods/${november}/advance`)).body.status,
      ).toBe('SPONSOR_REVIEW');
      const last = await call(AMARA, 'post', `/periods/${november}/advance`);
      expect(last.status).toBe(409);
      expect(last.body.code).toBe('READY_TO_LOCK');
      expect(
        (await call(HASSAN, 'post', `/periods/${november}/advance`)).status,
      ).toBe(403);
    });
  });
});
