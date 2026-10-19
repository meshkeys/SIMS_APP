import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { DEMO_PASSWORD, emailFor } from '../../prisma/seed/demo/people.js';
import { createAdminPool } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';
import { loadDemo, signInAs } from '../setup/demo.js';

const AMARA = emailFor('strategyHead'); // Strategy Office + the only system administrator
const ANALYST = emailFor('strategyAnalyst'); // Strategy Office
const AUDITOR = emailFor('auditor'); // Internal audit
const HASSAN = emailFor('headDigital'); // Initiative owner

interface Member {
  membershipId: string;
  name: string;
  email: string;
  roles: string[];
  status: string;
  responsibilities: {
    owns: number;
    sponsors: number;
    decisionsPending: number;
  };
  can: { edit: boolean; deactivate: boolean; reactivate: boolean };
}

describe('Administration (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  let token: ReturnType<typeof signInAs>;
  const ids: Record<string, string> = {};

  const call = async (
    as: string,
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    body?: object,
  ) => {
    const bearer = await token(as);
    return request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .auth(bearer, { type: 'bearer' })
      .send(body);
  };
  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: DEMO_PASSWORD });
  const member = async (email: string, as = AMARA, status = '') =>
    (
      (
        await call(
          as,
          'get',
          `/admin/members?q=${encodeURIComponent(email)}${status}`,
        )
      ).body.items as Member[]
    )[0]!;

  beforeAll(async () => {
    admin = createAdminPool();
    await loadDemo(admin);
    app = await createTestApp();
    token = signInAs(app);
    const rows = await admin.query(
      `SELECT u.email, m.id FROM "Membership" m JOIN "User" u ON u.id = m."userId"`,
    );
    for (const row of rows.rows) ids[row.email] = row.id;
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  describe('members', () => {
    it('lists members with their roles, status and what they are accountable for', async () => {
      const response = await call(AMARA, 'get', '/admin/members?pageSize=100');

      expect(response.status).toBe(200);
      expect(response.body.counts.ACTIVE).toBe(response.body.total);
      const hassan = (response.body.items as Member[]).find(
        (m) => m.email === HASSAN,
      )!;
      expect(hassan).toMatchObject({
        roles: ['INITIATIVE_OWNER'],
        status: 'ACTIVE',
        can: { edit: true, deactivate: true, reactivate: false },
      });
      expect(hassan.responsibilities.owns).toBeGreaterThan(0);
      // Nobody deactivates themselves.
      const amara = (response.body.items as Member[]).find(
        (m) => m.email === AMARA,
      )!;
      expect(amara.can.deactivate).toBe(false);
    });

    it('leaves administrators to administrators', async () => {
      expect((await member(AMARA, ANALYST)).can).toEqual({
        edit: false,
        deactivate: false,
        reactivate: false,
      });
      const response = await call(
        ANALYST,
        'patch',
        `/admin/members/${ids[HASSAN]}`,
        {
          roles: ['INITIATIVE_OWNER', 'SYSTEM_ADMIN'],
        },
      );
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('ADMIN_ONLY');
    });

    it('is for the Strategy Office and administrators', async () => {
      expect((await call(HASSAN, 'get', '/admin/members')).status).toBe(403);
    });

    it('changes roles and details, with an audit record', async () => {
      const response = await call(
        ANALYST,
        'patch',
        `/admin/members/${ids[HASSAN]}`,
        {
          roles: ['INITIATIVE_OWNER', 'EXECUTIVE_SPONSOR', 'INITIATIVE_OWNER'],
          jobTitle: 'Group Head, Digital Business',
          managerId: ids[AMARA],
        },
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        roles: ['INITIATIVE_OWNER', 'EXECUTIVE_SPONSOR'],
        jobTitle: 'Group Head, Digital Business',
        manager: { name: expect.any(String) },
      });
      const audit = await admin.query(
        `SELECT action, before, after FROM "AuditEvent" WHERE "entityId" = $1`,
        [ids[HASSAN]],
      );
      expect(audit.rows[0]).toMatchObject({
        action: 'MEMBER_UPDATED',
        before: { roles: ['INITIATIVE_OWNER'] },
      });
    });

    it('checks managers and departments', async () => {
      const self = await call(AMARA, 'patch', `/admin/members/${ids[HASSAN]}`, {
        managerId: ids[HASSAN],
      });
      expect(self.status).toBe(400);
      expect(self.body.errors[0]).toMatchObject({ path: 'managerId' });
      const department = await call(
        AMARA,
        'patch',
        `/admin/members/${ids[HASSAN]}`,
        {
          departmentId: '00000000-0000-7000-8000-000000000000',
        },
      );
      expect(department.status).toBe(400);
    });

    it('never removes the last administrator', async () => {
      const response = await call(
        AMARA,
        'patch',
        `/admin/members/${ids[AMARA]}`,
        {
          roles: ['STRATEGY_OFFICE'],
        },
      );
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('LAST_ADMIN');
      const self = await call(
        AMARA,
        'post',
        `/admin/members/${ids[AMARA]}/deactivate`,
      );
      expect(self.status).toBe(409);
      expect(self.body.code).toBe('CANNOT_DEACTIVATE_SELF');
    });

    it('ends and restores a member’s access', async () => {
      const deactivated = await call(
        AMARA,
        'post',
        `/admin/members/${ids[HASSAN]}/deactivate`,
      );
      expect(deactivated.status).toBe(200);
      expect(deactivated.body).toMatchObject({
        status: 'DEACTIVATED',
        can: { edit: false, deactivate: false, reactivate: true },
      });
      const refused = await login(HASSAN);
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe('NO_ACTIVE_MEMBERSHIP');
      expect(await member(HASSAN)).toBeUndefined();
      expect(await member(HASSAN, AMARA, '&status=DEACTIVATED')).toMatchObject({
        status: 'DEACTIVATED',
      });

      const again = await call(
        AMARA,
        'post',
        `/admin/members/${ids[HASSAN]}/deactivate`,
      );
      expect(again.status).toBe(409);

      const reactivated = await call(
        AMARA,
        'post',
        `/admin/members/${ids[HASSAN]}/reactivate`,
      );
      expect(reactivated.body.status).toBe('ACTIVE');
      expect((await login(HASSAN)).status).toBe(200);
    });
  });

  describe('departments', () => {
    let lab: string;

    it('adds, renames and nests departments', async () => {
      const parent = (await call(AMARA, 'get', '/departments')).body[0];
      const created = await call(ANALYST, 'post', '/departments', {
        name: 'Innovation Lab',
        code: 'INN',
        parentId: parent.id,
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        name: 'Innovation Lab',
        code: 'INN',
        parentId: parent.id,
        memberCount: 0,
      });
      lab = created.body.id;

      const renamed = await call(ANALYST, 'patch', `/departments/${lab}`, {
        name: 'Innovation & Ventures',
        parentId: null,
      });
      expect(renamed.body).toMatchObject({
        name: 'Innovation & Ventures',
        parentId: null,
      });

      const duplicate = await call(ANALYST, 'post', '/departments', {
        name: parent.name,
      });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe('NAME_TAKEN');
    });

    it('never puts a department inside itself', async () => {
      const child = await call(AMARA, 'post', '/departments', {
        name: 'Venture Studio',
        parentId: lab,
      });
      const response = await call(AMARA, 'patch', `/departments/${lab}`, {
        parentId: child.body.id,
      });
      expect(response.status).toBe(400);
      expect(response.body.errors[0]).toMatchObject({
        path: 'parentId',
        message: 'A department cannot sit inside itself',
      });
      expect(
        (await call(AMARA, 'delete', `/departments/${child.body.id}`)).status,
      ).toBe(204);
    });

    it('deletes only empty departments', async () => {
      const busy = (await call(AMARA, 'get', '/departments')).body.find(
        (d: { memberCount: number }) => d.memberCount > 0,
      );
      const refused = await call(AMARA, 'delete', `/departments/${busy.id}`);
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('DEPARTMENT_IN_USE');
      expect(refused.body.detail).toMatch(/still has \d+ members?/);

      expect((await call(AMARA, 'delete', `/departments/${lab}`)).status).toBe(
        204,
      );
      const names = (await call(AMARA, 'get', '/departments')).body.map(
        (d: { name: string }) => d.name,
      );
      expect(names).not.toContain('Innovation & Ventures');
    });
  });

  describe('organisation settings', () => {
    it('can be read by any member', async () => {
      const response = await call(HASSAN, 'get', '/organisation');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: 'Meridian Financial Group',
        currency: 'NGN',
        timezone: 'Africa/Lagos',
        terminology: { kpi: 'KPI', initiative: 'Initiative' },
      });
    });

    it('are changed by a system administrator only, and checked', async () => {
      expect(
        (
          await call(ANALYST, 'patch', '/organisation', {
            name: 'Meridian Group',
          })
        ).status,
      ).toBe(403);

      const invalid = await call(AMARA, 'patch', '/organisation', {
        timezone: 'Lagos/Africa',
        currency: 'XYZ',
      });
      expect(invalid.status).toBe(400);
      expect(invalid.body.errors.map((e: { path: string }) => e.path)).toEqual([
        'timezone',
        'currency',
      ]);

      const response = await call(AMARA, 'patch', '/organisation', {
        name: 'Meridian Group',
        fiscalYearStartMonth: 4,
        terminology: {
          kpi: 'Measure',
          initiative: 'Programme',
          milestone: 'Milestone',
          task: 'Task',
        },
      });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: 'Meridian Group',
        fiscalYearStartMonth: 4,
        terminology: { kpi: 'Measure', initiative: 'Programme' },
      });
    });
  });

  describe('audit log', () => {
    it('lists every change, newest first, with who made it', async () => {
      const response = await call(AUDITOR, 'get', '/audit');
      expect(response.status).toBe(200);
      // Sign-ins are recorded too; the auditor's own is the newest.
      expect(response.body.items[0]).toMatchObject({
        action: 'USER_SIGNED_IN',
      });

      const organisation = await call(
        AUDITOR,
        'get',
        '/audit?entityType=Organisation',
      );
      expect(organisation.body.items[0]).toMatchObject({
        action: 'ORGANISATION_UPDATED',
        actionLabel: 'Organisation updated',
        entityType: 'Organisation',
        actor: { name: expect.any(String) },
        after: { name: 'Meridian Group' },
      });
      expect(response.body.actions).toEqual(
        expect.arrayContaining(['MEMBER_DEACTIVATED', 'DEPARTMENT_CREATED']),
      );
      expect(response.body.entityTypes).toEqual(
        expect.arrayContaining(['Membership', 'Department']),
      );
    });

    it('filters by action, entity and dates', async () => {
      const deactivations = await call(
        AUDITOR,
        'get',
        '/audit?action=MEMBER_DEACTIVATED',
      );
      expect(deactivations.body.total).toBe(1);
      expect(deactivations.body.items[0].entityId).toBe(ids[HASSAN]);

      const forHassan = await call(
        AUDITOR,
        'get',
        `/audit?entityId=${ids[HASSAN]}`,
      );
      expect(
        forHassan.body.items.map((e: { action: string }) => e.action),
      ).toEqual(['MEMBER_REACTIVATED', 'MEMBER_DEACTIVATED', 'MEMBER_UPDATED']);

      const future = await call(AUDITOR, 'get', '/audit?from=2099-01-01');
      expect(future.body).toMatchObject({ total: 0, items: [] });
    });

    it('is for administrators, the Strategy Office and internal audit', async () => {
      expect((await call(HASSAN, 'get', '/audit')).status).toBe(403);
    });
  });
});
