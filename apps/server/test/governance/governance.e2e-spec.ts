import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { emailFor } from '../../prisma/seed/demo/people.js';
import { CLOCK, FixedClock } from '../../src/common/clock/clock.js';
import { createAdminPool } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';
import { loadDemo, signInAs } from '../setup/demo.js';

const AMARA = emailFor('strategyHead'); // Strategy Office
const HASSAN = emailFor('headDigital'); // owner of DIG-002, DIG-004
const CEO = emailFor('ceo');
const ED_BUSINESS = emailFor('edBusiness'); // sponsor of DIG-004
const ED_RETAIL = emailFor('edRetail'); // sponsor of CX-004
const AISHA = emailFor('headService'); // owner of CX-004
const COO = emailFor('coo');
const COMPLIANCE = emailFor('headCompliance'); // owns the SEC approval risk

const DEMO_NOW = new Date('2026-10-16T09:00:00Z');

describe('Governance (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  let token: ReturnType<typeof signInAs>;
  const clock = new FixedClock(DEMO_NOW);
  const ids: Record<string, string> = {};

  const call = async (
    as: string,
    method: 'get' | 'post' | 'patch',
    path: string,
    body?: object,
  ) => {
    const bearer = await token(as);
    return request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .auth(bearer, { type: 'bearer' })
      .send(body);
  };
  const openDecisions = async (as = AMARA) =>
    (await call(as, 'get', '/decisions')).body.items as {
      id: string;
      reference: string;
      title: string;
      kind: string;
      overdueDays: number;
      canDecide: boolean;
      changeRequestId: string | null;
    }[];
  const decisionId = async (reference: string) =>
    (await openDecisions()).find((d) => d.reference === reference)!.id;
  const initiative = async (code: string) =>
    (await call(AMARA, 'get', `/initiatives/${ids[code]}`)).body;

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

  describe('risk register', () => {
    it('reproduces the portfolio heatmap and counts', async () => {
      const { body } = await call(AMARA, 'get', '/risks');
      expect(body.counts).toMatchObject({ risks: 31, issues: 4 });
      expect(body.total).toBe(35);
      expect(body.heatmap).toEqual([
        [0, 1, 2, 1, 1],
        [0, 1, 3, 2, 1],
        [1, 2, 4, 2, 0],
        [2, 3, 2, 1, 0],
        [1, 1, 0, 0, 0],
      ]);
      expect(body.items[0].severity).toBe('CRITICAL');
    });

    it('filters by type and by heatmap cell', async () => {
      expect((await call(AMARA, 'get', '/risks?type=ISSUE')).body.total).toBe(
        4,
      );
      expect(
        (await call(AMARA, 'get', '/risks?likelihood=3&impact=4')).body.total,
      ).toBe(3);
    });

    it('scores risks from likelihood × impact and validates by type', async () => {
      const risk = await call(HASSAN, 'post', '/risks', {
        initiativeId: ids['DIG-002'],
        type: 'RISK',
        title: 'App store review delays release',
        likelihood: 2,
        impact: 3,
        severity: 'CRITICAL', // ignored: risks are scored
      });
      expect(risk.status).toBe(201);
      expect(risk.body).toMatchObject({
        severity: 'MEDIUM',
        score: 6,
        initiative: { code: 'DIG-002' },
      });

      const noScore = await call(HASSAN, 'post', '/risks', {
        initiativeId: ids['DIG-002'],
        type: 'RISK',
        title: 'Unscored',
      });
      expect(noScore.body.errors.map((e: { path: string }) => e.path)).toEqual([
        'likelihood',
        'impact',
      ]);
      const noSeverity = await call(HASSAN, 'post', '/risks', {
        initiativeId: ids['DIG-002'],
        type: 'ISSUE',
        title: 'Unrated',
      });
      expect(noSeverity.body.errors[0].path).toBe('severity');
    });

    it('caps health at Amber while a critical issue is open, and releases it when closed', async () => {
      const issue = await call(HASSAN, 'post', '/risks', {
        initiativeId: ids['DIG-002'],
        type: 'ISSUE',
        title: 'Payment SDK withdrawn by provider',
        severity: 'CRITICAL',
      });
      expect((await initiative('DIG-002')).health.calculated).toBe('AMBER');

      const closed = await call(HASSAN, 'patch', `/risks/${issue.body.id}`, {
        status: 'CLOSED',
      });
      expect(closed.body).toMatchObject({
        status: 'CLOSED',
        closedAt: DEMO_NOW.toISOString(),
      });
      expect((await initiative('DIG-002')).health.calculated).toBe('GREEN');
    });

    it('limits who records and changes risks', async () => {
      const notTheirs = await call(COO, 'post', '/risks', {
        initiativeId: ids['DIG-004'],
        type: 'ISSUE',
        title: 'Not my initiative',
        severity: 'LOW',
      });
      expect(notTheirs.status).toBe(403);
      const portfolio = await call(HASSAN, 'post', '/risks', {
        type: 'ISSUE',
        title: 'Market-wide',
        severity: 'HIGH',
      });
      expect(portfolio.body.code).toBe('STRATEGY_OFFICE_ONLY');
      expect(
        (
          await call(AMARA, 'post', '/risks', {
            type: 'ISSUE',
            title: 'Market-wide FX shortage',
            severity: 'HIGH',
          })
        ).status,
      ).toBe(201);

      // The risk's own owner may update it.
      const sec = (await call(AMARA, 'get', '/risks?q=SEC product')).body
        .items[0];
      const update = await call(COMPLIANCE, 'patch', `/risks/${sec.id}`, {
        mitigation: 'Filing submitted 15 Oct.',
      });
      expect(update.status).toBe(200);
    });
  });

  describe('decisions required', () => {
    it('lists open decisions by due date, flagging overdue ones', async () => {
      const items = await openDecisions();
      expect(items.map((d) => [d.reference, d.kind, d.overdueDays])).toEqual([
        ['GOV-031', 'DECISION', 3],
        ['CR-0142', 'CHANGE_REQUEST', 0],
        ['CR-0139', 'CHANGE_REQUEST', 0],
      ]);
      expect(items.map((d) => d.canDecide)).toEqual([true, false, false]);
    });

    it('keeps a log of decided items', async () => {
      const log = (await call(AMARA, 'get', '/decisions?view=log')).body.items;
      expect(
        log.map(
          (d: { reference: string; outcome: string }) =>
            `${d.reference} ${d.outcome}`,
        ),
      ).toEqual(['GOV-028 APPROVED', 'GOV-027 REJECTED', 'GOV-025 DEFERRED']);
    });

    it('applies an approved baseline change (the MD/CEO decides CR-0142)', async () => {
      const id = await decisionId('CR-0142');
      expect(
        (
          await call(AMARA, 'post', `/decisions/${id}/decide`, {
            outcome: 'APPROVED',
          })
        ).status,
      ).toBe(403);

      const approved = await call(CEO, 'post', `/decisions/${id}/decide`, {
        outcome: 'APPROVED',
        notes: 'Agreed at EXCO.',
      });
      expect(approved.status).toBe(200);
      expect(approved.body).toMatchObject({
        outcome: 'APPROVED',
        decidedBy: { name: 'Ngozi Eze' },
      });
      expect((await initiative('DIG-007')).baseline.end).toBe('2026-11-26');

      const again = await call(CEO, 'post', `/decisions/${id}/decide`, {
        outcome: 'REJECTED',
        notes: 'Changed my mind.',
      });
      expect(again.body.code).toBe('ALREADY_DECIDED');
    });

    it('lets the sponsor approve a budget change (CR-0139)', async () => {
      const id = await decisionId('CR-0139');
      await call(ED_BUSINESS, 'post', `/decisions/${id}/decide`, {
        outcome: 'APPROVED',
      });
      expect((await initiative('DIG-004')).budget.baseline).toBe(1_285_000_000);
    });

    it('defers a decision until a date, then brings it back', async () => {
      const id = await decisionId('GOV-031');
      const noDate = await call(AMARA, 'post', `/decisions/${id}/decide`, {
        outcome: 'DEFERRED',
        notes: 'Await HR review.',
      });
      expect(noDate.status).toBe(400);

      await call(AMARA, 'post', `/decisions/${id}/decide`, {
        outcome: 'DEFERRED',
        notes: 'Await the HR review of branch staffing.',
        deferredUntil: '2026-10-30',
      });
      expect((await openDecisions()).map((d) => d.reference)).not.toContain(
        'GOV-031',
      );

      clock.set(new Date('2026-10-30T09:00:00Z'));
      expect((await openDecisions()).map((d) => d.reference)).toContain(
        'GOV-031',
      );
      clock.set(DEMO_NOW);
    });
  });

  describe('change requests', () => {
    let crId: string;

    it('are the only way to change an active baseline, routed to the MD/CEO', async () => {
      const dig004 = await initiative('DIG-004');
      const vendor = dig004.milestones.find(
        (m: { title: string }) => m.title === 'Vendor contract signed',
      );
      const tech = dig004.milestones.find(
        (m: { title: string }) => m.title === 'Technology development',
      );

      const response = await call(
        HASSAN,
        'post',
        `/initiatives/${ids['DIG-004']}/change-requests`,
        {
          type: 'BASELINE_CHANGE',
          changes: {
            milestones: [
              { milestoneId: vendor.id, isCritical: false },
              { milestoneId: tech.id, baselineDate: '2026-10-31' },
            ],
          },
          justification:
            'Contract terms agreed; signature no longer gates development.',
        },
      );
      expect(response.status).toBe(201);
      crId = response.body.id;
      expect(response.body).toMatchObject({
        reference: 'CR-0143',
        status: 'PENDING',
        requestedBy: { name: 'Hassan Danjuma' },
        approver: { name: 'Ngozi Eze' },
      });
      const decision = (await openDecisions()).find(
        (d) => d.reference === 'CR-0143',
      );
      expect(decision?.title).toBe(
        'Approve baseline change for DIG-004: 2 milestones',
      );
    });

    it('validate what each type may change, and coherence', async () => {
      const wrongField = await call(
        HASSAN,
        'post',
        `/initiatives/${ids['DIG-004']}/change-requests`,
        {
          type: 'BUDGET_CHANGE',
          changes: { baselineEnd: '2027-01-31' },
          justification: 'Mixing a date into a budget request should fail.',
        },
      );
      expect(wrongField.body.errors[0].path).toBe('changes.baselineEnd');

      const backwards = await call(
        HASSAN,
        'post',
        `/initiatives/${ids['DIG-004']}/change-requests`,
        {
          type: 'BASELINE_CHANGE',
          changes: { baselineEnd: '2025-01-01' },
          justification: 'An end date before the start must be refused.',
        },
      );
      expect(backwards.status).toBe(400);
      expect(backwards.body.errors[0].path).toBe('changes.baselineEnd');

      const notNeeded = await call(
        AMARA,
        'post',
        `/initiatives/${ids['REV-009']}/change-requests`,
        {
          type: 'BUDGET_CHANGE',
          changes: { baselineBudget: 1 },
          justification: 'Pipeline initiatives are edited directly instead.',
        },
      );
      expect(notNeeded.body.code).toBe('CHANGE_REQUEST_NOT_NEEDED');
    });

    it('when approved, apply and recalculate health (the forced Red goes)', async () => {
      const ceoDecisions = await openDecisions(CEO);
      const decision = ceoDecisions.find((d) => d.changeRequestId === crId)!;
      expect(decision.canDecide).toBe(true);

      await call(CEO, 'post', `/decisions/${decision.id}/decide`, {
        outcome: 'APPROVED',
      });
      const dig004 = await initiative('DIG-004');
      expect(dig004.health.calculated).toBe('AMBER');
      expect(
        dig004.health.reasons.map((r: { rule: string }) => r.rule),
      ).not.toContain('OVERDUE_CRITICAL_MILESTONE');
      expect(dig004.activity[0].action).toBe('BASELINE_CHANGED');
      expect(
        (await call(HASSAN, 'get', `/change-requests/${crId}`)).body.status,
      ).toBe('APPROVED');
    });

    it('go to the CEO when the sponsor is the requester (nobody approves their own)', async () => {
      const response = await call(
        ED_BUSINESS,
        'post',
        `/initiatives/${ids['DIG-004']}/change-requests`,
        {
          type: 'BUDGET_CHANGE',
          changes: { baselineBudget: 1_400_000_000 },
          justification: 'Additional security testing scope requires budget.',
        },
      );
      expect(response.body.approver).toMatchObject({ name: 'Ngozi Eze' });
      const decision = (await openDecisions(ED_BUSINESS)).find(
        (d) => d.changeRequestId === response.body.id,
      )!;
      expect(decision.canDecide).toBe(false);
    });

    it('can be withdrawn by the requester', async () => {
      const response = await call(
        HASSAN,
        'post',
        `/initiatives/${ids['DIG-004']}/change-requests`,
        {
          type: 'SCOPE_CHANGE',
          changes: {
            scope: 'Retail investors only; institutional clients in phase 2.',
          },
          justification: 'Narrow the launch to reduce delivery risk.',
        },
      );
      expect(response.body.approver).toMatchObject({
        jobTitle: 'ED, Business',
      });

      const withdrawn = await call(
        HASSAN,
        'post',
        `/change-requests/${response.body.id}/withdraw`,
      );
      expect(withdrawn.body.status).toBe('WITHDRAWN');
      expect(
        (await openDecisions()).map((d) => d.changeRequestId),
      ).not.toContain(response.body.id);
    });
  });

  describe('decisions from updates', () => {
    it('puts "I need a management decision" in front of the sponsor', async () => {
      const october = (await call(AMARA, 'get', '/periods/current')).body.id;
      const form = (
        await call(AISHA, 'get', `/periods/${october}/updates/${ids['CX-004']}`)
      ).body;
      const submitted = await call(
        AISHA,
        'post',
        `/periods/${october}/updates/${ids['CX-004']}/submit`,
        {
          lines: form.lines
            .filter((l: { locked: boolean }) => !l.locked)
            .map((l: { milestoneId: string }) => ({
              milestoneId: l.milestoneId,
              claimedCompletion: 0,
            })),
          progressNarrative:
            'Workflow configuration finished for retail complaints.',
          varianceExplanation:
            'CRM vendor capacity: we need approval to switch vendors.',
          recoveryAction: 'Switch to the second vendor if approved.',
          needsDecision: true,
        },
      );
      expect(submitted.status).toBe(200);

      const sponsorView = await openDecisions(ED_RETAIL);
      const decision = sponsorView.find(
        (d) =>
          d.title === 'Decision needed on CX-004 Complaints Management System',
      );
      expect(decision).toMatchObject({ kind: 'DECISION', canDecide: true });
    });
  });
});
