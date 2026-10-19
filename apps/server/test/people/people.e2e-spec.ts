import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { emailFor } from '../../prisma/seed/demo/people.js';
import { createAdminPool } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';
import { loadDemo, signInAs } from '../setup/demo.js';

const HASSAN = emailFor('headDigital'); // an initiative owner, no special roles

interface Member {
  membershipId: string;
  name: string;
  email: string;
  jobTitle: string | null;
  department: { id: string; name: string } | null;
  roles: string[];
}

describe('People directory and departments (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  let token: ReturnType<typeof signInAs>;
  let activeMembers: number;

  const get = async (path: string) => {
    const bearer = await token(HASSAN);
    return request(app.getHttpServer())
      .get(`/api/v1${path}`)
      .auth(bearer, { type: 'bearer' });
  };

  beforeAll(async () => {
    admin = createAdminPool();
    await loadDemo(admin);
    const { organisationId } = (
      await admin.query<{ organisationId: string }>(
        `SELECT id AS "organisationId" FROM "Organisation" WHERE slug = 'meridian'`,
      )
    ).rows[0]!;
    app = await createTestApp();
    token = signInAs(app);
    activeMembers = (
      await admin.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM "Membership" WHERE "organisationId" = $1 AND status = 'ACTIVE'`,
        [organisationId],
      )
    ).rows[0]!.n;
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  it('lists active members by name, a page at a time', async () => {
    const { status, body } = await get('/members?pageSize=10');
    expect(status).toBe(200);
    expect(body.total).toBe(activeMembers);
    expect(body.items).toHaveLength(10);
    const names = (body.items as Member[]).map((m) => m.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    // Only this organisation's people.
    for (const member of body.items as Member[]) {
      expect(member.email).toMatch(/@meridian\.example$/);
    }
  });

  it('finds people by name, email or job title', async () => {
    const byName = (await get('/members?q=bello')).body.items as Member[];
    expect(byName.map((m) => m.name)).toContain('Amara Bello');

    const byTitle = (await get('/members?q=head,%20digital')).body
      .items as Member[];
    expect(byTitle).toEqual([
      expect.objectContaining({
        name: 'Hassan Danjuma',
        jobTitle: 'Head, Digital Business',
        department: expect.objectContaining({ name: 'Digital Business' }),
        roles: ['INITIATIVE_OWNER'],
      }),
    ]);
  });

  it('narrows by role and by department', async () => {
    const sponsors = (await get('/members?role=EXECUTIVE_SPONSOR&pageSize=50'))
      .body.items as Member[];
    expect(sponsors.length).toBeGreaterThan(0);
    for (const s of sponsors) expect(s.roles).toContain('EXECUTIVE_SPONSOR');

    const departments = (await get('/departments')).body as {
      id: string;
      name: string;
    }[];
    const digital = departments.find((d) => d.name === 'Digital Business')!;
    const inDigital = (await get(`/members?departmentId=${digital.id}`)).body
      .items as Member[];
    expect(inDigital.length).toBeGreaterThan(0);
    for (const m of inDigital) expect(m.department?.id).toBe(digital.id);
  });

  it('rejects bad filters with field errors', async () => {
    const response = await get('/members?pageSize=500&role=WIZARD');
    expect(response.status).toBe(400);
    expect(
      (response.body.errors as { path: string }[]).map((e) => e.path).sort(),
    ).toEqual(['pageSize', 'role']);
  });

  it('lists departments by name with their member counts', async () => {
    const { status, body } = await get('/departments');
    expect(status).toBe(200);
    const names = (body as { name: string }[]).map((d) => d.name);
    expect(names).toContain('Strategy Office');
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    const counted = (body as { memberCount: number }[]).reduce(
      (sum, d) => sum + d.memberCount,
      0,
    );
    expect(counted).toBeLessThanOrEqual(activeMembers);
    expect(counted).toBeGreaterThan(0);
  });
});
