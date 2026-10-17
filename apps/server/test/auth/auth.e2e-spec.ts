import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaPg } from '@prisma/adapter-pg';
import type pg from 'pg';
import request from 'supertest';
import { DEMO_PASSWORD, emailFor } from '../../prisma/seed/demo/people.js';
import { seedDemo } from '../../prisma/seed/demo/seed-demo.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { TenantPrismaService } from '../../src/infrastructure/database/index.js';
import { Roles } from '../../src/modules/auth/index.js';
import { createAdminPool, resetDatabase } from '../setup/admin-db.js';
import {
  cookieFrom,
  createTestApp,
  setCookieLine,
} from '../setup/create-app.js';
import { TEST_DATABASE_ADMIN_URL } from '../setup/test-database.js';

/** Test-only endpoints proving guards and tenant scoping through real HTTP. */
@Controller('probe')
class ProbeController {
  constructor(private readonly db: TenantPrismaService) {}

  @Get('initiatives')
  async countInitiatives() {
    return { count: await this.db.client.initiative.count() };
  }

  @Roles('BOARD')
  @Get('board-only')
  boardOnly() {
    return { ok: true };
  }
}

const AMARA = emailFor('strategyHead');
const BOARD_CHAIR = emailFor('boardChair');

const newOrg = (overrides: Record<string, unknown> = {}) => ({
  organisationName: 'Acme Holdings',
  sector: 'PRIVATE',
  country: 'ng',
  name: 'Ada Lovelace',
  email: 'ada@acme.example',
  password: 'correct-horse-battery',
  ...overrides,
});

describe('Authentication (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  const http = () => request(app.getHttpServer());

  const login = (email: string, password = DEMO_PASSWORD) =>
    http().post('/api/v1/auth/login').send({ email, password });

  beforeAll(async () => {
    admin = createAdminPool();
    await resetDatabase(admin);
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: TEST_DATABASE_ADMIN_URL }),
    });
    await seedDemo(prisma);
    await prisma.$disconnect();
    app = await createTestApp({ controllers: [ProbeController] });
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  describe('sign-up', () => {
    it('creates the person, organisation, trial and default rules, and signs in', async () => {
      const response = await http().post('/api/v1/auth/signup').send(newOrg());

      expect(response.status).toBe(201);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.session).toMatchObject({
        user: { name: 'Ada Lovelace', email: 'ada@acme.example' },
        organisation: {
          name: 'Acme Holdings',
          slug: 'acme-holdings',
          status: 'ONBOARDING',
          currency: 'NGN',
        },
        membership: { roles: ['SYSTEM_ADMIN', 'STRATEGY_OFFICE'] },
      });
      // Never returned in the body: only in an httpOnly, SameSite=Strict cookie
      // scoped to the auth endpoints.
      expect(JSON.stringify(response.body)).not.toContain('refresh');
      const cookie = setCookieLine(response, 'sims_rt');
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);

      const orgId = response.body.session.organisation.id;
      const { rows } = await admin.query(
        `SELECT s.plan, r.version, r.status AS ruleset, o.country
         FROM "Organisation" o
         JOIN "Subscription" s ON s."organisationId" = o.id
         JOIN "Ruleset" r ON r."organisationId" = o.id
         WHERE o.id = $1`,
        [orgId],
      );
      expect(rows).toEqual([
        { plan: 'TRIAL', version: 1, ruleset: 'ACTIVE', country: 'NG' },
      ]);
    });

    it('refuses an email that already has an account', async () => {
      const response = await http()
        .post('/api/v1/auth/signup')
        .send(newOrg({ email: '  ADA@acme.example ' }));

      expect(response.status).toBe(409);
      expect(response.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(response.body).toMatchObject({ status: 409, code: 'EMAIL_TAKEN' });
    });

    it('makes a derived workspace address unique', async () => {
      const response = await http()
        .post('/api/v1/auth/signup')
        .send(newOrg({ email: 'grace@acme.example' }));

      expect(response.status).toBe(201);
      expect(response.body.session.organisation.slug).toMatch(
        /^acme-holdings-[a-z0-9]{4}$/,
      );
    });

    it('refuses a chosen workspace address that is taken', async () => {
      const response = await http()
        .post('/api/v1/auth/signup')
        .send(
          newOrg({ email: 'alan@acme.example', organisationSlug: 'meridian' }),
        );

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('SLUG_TAKEN');
    });

    it('lists every invalid field', async () => {
      const response = await http()
        .post('/api/v1/auth/signup')
        .send({
          organisationName: 'X',
          email: 'not-an-email',
          password: 'short',
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
      const paths = response.body.errors.map((e: { path: string }) => e.path);
      expect(paths).toEqual(
        expect.arrayContaining([
          'organisationName',
          'email',
          'password',
          'sector',
          'country',
          'name',
        ]),
      );
    });
  });

  describe('sign-in', () => {
    it('signs a demo user into their workspace', async () => {
      const response = await login(AMARA);

      expect(response.status).toBe(200);
      expect(response.body.session).toMatchObject({
        user: { name: 'Amara Bello' },
        organisation: { slug: 'meridian' },
        membership: { jobTitle: 'Head, Strategy Office' },
      });
      expect(cookieFrom(response, 'sims_rt')).toBeDefined();
    });

    it('gives the same answer for a wrong password and an unknown email', async () => {
      const wrongPassword = await login(AMARA, 'not-the-password');
      const unknownEmail = await login(
        'nobody@meridian.example',
        'not-the-password',
      );

      for (const response of [wrongPassword, unknownEmail]) {
        expect(response.status).toBe(401);
        expect(response.body.code).toBe('INVALID_CREDENTIALS');
        expect(response.body.detail).toBe('Email or password is incorrect.');
      }
    });

    it('records the sign-in in the organisation’s audit trail', async () => {
      const { rows } = await admin.query(
        `SELECT count(*)::int AS n FROM "AuditEvent" WHERE action = 'USER_SIGNED_IN'`,
      );
      expect(rows[0].n).toBeGreaterThan(0);
    });
  });

  describe('access tokens', () => {
    it('protects routes by default', async () => {
      const response = await http().get('/api/v1/auth/me');
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHENTICATED');
    });

    it('rejects a tampered token', async () => {
      const { body } = await login(AMARA);
      const [header, payload, signature] = body.accessToken.split('.');
      const forged = `${header}.${payload}.${signature.slice(0, -2)}xx`;

      const response = await http()
        .get('/api/v1/auth/me')
        .auth(forged, { type: 'bearer' });
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('INVALID_TOKEN');
    });

    it('returns the current session from /me', async () => {
      const { body } = await login(AMARA);
      const response = await http()
        .get('/api/v1/auth/me')
        .auth(body.accessToken, { type: 'bearer' });

      expect(response.status).toBe(200);
      expect(response.body.organisation.slug).toBe('meridian');
      expect(response.body.membership.roles).toEqual([
        'STRATEGY_OFFICE',
        'SYSTEM_ADMIN',
      ]);
    });
  });

  describe('tenant isolation over HTTP', () => {
    it('scopes every query to the caller’s organisation', async () => {
      const meridian = await login(AMARA);
      const acme = await login('ada@acme.example', 'correct-horse-battery');

      const seenByMeridian = await http()
        .get('/api/v1/probe/initiatives')
        .auth(meridian.body.accessToken, { type: 'bearer' });
      const seenByAcme = await http()
        .get('/api/v1/probe/initiatives')
        .auth(acme.body.accessToken, { type: 'bearer' });

      expect(seenByMeridian.body).toEqual({ count: 45 });
      expect(seenByAcme.body).toEqual({ count: 0 });
    });
  });

  describe('roles', () => {
    it('forbids callers without the required role', async () => {
      const { body } = await login(AMARA);
      const response = await http()
        .get('/api/v1/probe/board-only')
        .auth(body.accessToken, { type: 'bearer' });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('INSUFFICIENT_ROLE');
    });

    it('allows callers with the role', async () => {
      const { body } = await login(BOARD_CHAIR);
      const response = await http()
        .get('/api/v1/probe/board-only')
        .auth(body.accessToken, { type: 'bearer' });

      expect(response.status).toBe(200);
    });
  });

  describe('refresh tokens', () => {
    it('rotates the refresh token on every use', async () => {
      const first = cookieFrom(await login(AMARA), 'sims_rt')!;
      const refreshed = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', first);

      expect(refreshed.status).toBe(200);
      expect(refreshed.body.accessToken).toEqual(expect.any(String));
      const second = cookieFrom(refreshed, 'sims_rt')!;
      expect(second).toBeDefined();
      expect(second).not.toBe(first);
    });

    it('revokes the whole sign-in when an old token is replayed', async () => {
      const stolen = cookieFrom(await login(AMARA), 'sims_rt')!;
      const legit = cookieFrom(
        await http().post('/api/v1/auth/refresh').set('Cookie', stolen),
        'sims_rt',
      )!;
      // Move the rotation outside the 30 s two-tabs grace window.
      await admin.query(
        `UPDATE "RefreshToken" SET "revokedAt" = now() - interval '5 minutes'
         WHERE "replacedById" IS NOT NULL AND "revokedAt" > now() - interval '1 minute'`,
      );

      const replay = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', stolen);
      expect(replay.status).toBe(401);
      expect(replay.body.code).toBe('REFRESH_TOKEN_REUSED');

      // The legitimate holder is signed out too: the family is burned.
      const legitAfter = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', legit);
      expect(legitAfter.status).toBe(401);
    });

    it('requires the cookie', async () => {
      const response = await http().post('/api/v1/auth/refresh');
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('ends the session when the membership is deactivated', async () => {
      const cookie = cookieFrom(await login(emailFor('auditor')), 'sims_rt')!;
      await admin.query(
        `UPDATE "Membership" m SET status = 'DEACTIVATED' FROM "User" u
         WHERE u.id = m."userId" AND u.email = $1`,
        [emailFor('auditor')],
      );

      const response = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie);
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('MEMBERSHIP_INACTIVE');
      expect(setCookieLine(response, 'sims_rt')).toMatch(
        /Expires=Thu, 01 Jan 1970/,
      );
    });
  });

  describe('switching organisation', () => {
    it('opens another workspace the user belongs to', async () => {
      // Make Amara a member of Acme as well.
      await admin.query(
        `INSERT INTO "Membership" (id, "organisationId", "userId", roles, status, "updatedAt")
         SELECT gen_random_uuid(), o.id, u.id, ARRAY['BOARD']::"Role"[], 'ACTIVE', now()
         FROM "Organisation" o, "User" u WHERE o.slug = 'acme-holdings' AND u.email = $1`,
        [AMARA],
      );
      const signedIn = await login(AMARA);
      expect(signedIn.body.session.organisations).toHaveLength(2);
      const acmeId = signedIn.body.session.organisations.find(
        (o: { slug: string }) => o.slug === 'acme-holdings',
      ).id;

      const switched = await http()
        .post('/api/v1/auth/switch-organisation')
        .auth(signedIn.body.accessToken, { type: 'bearer' })
        .set('Cookie', cookieFrom(signedIn, 'sims_rt')!)
        .send({ organisationId: acmeId });

      expect(switched.status).toBe(200);
      expect(switched.body.session.organisation.slug).toBe('acme-holdings');
      expect(switched.body.session.membership.roles).toEqual(['BOARD']);

      const probe = await http()
        .get('/api/v1/probe/initiatives')
        .auth(switched.body.accessToken, { type: 'bearer' });
      expect(probe.body).toEqual({ count: 0 });
    });

    it('refuses a workspace the user does not belong to', async () => {
      const signedIn = await login(BOARD_CHAIR);
      const acme = await login('ada@acme.example', 'correct-horse-battery');

      const response = await http()
        .post('/api/v1/auth/switch-organisation')
        .auth(signedIn.body.accessToken, { type: 'bearer' })
        .set('Cookie', cookieFrom(signedIn, 'sims_rt')!)
        .send({ organisationId: acme.body.session.organisation.id });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('NO_ACTIVE_MEMBERSHIP');
    });
  });

  describe('sign-out', () => {
    it('revokes the refresh token and clears the cookie', async () => {
      const cookie = cookieFrom(await login(AMARA), 'sims_rt')!;

      const logout = await http()
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie);
      expect(logout.status).toBe(204);
      expect(setCookieLine(logout, 'sims_rt')).toMatch(
        /Expires=Thu, 01 Jan 1970/,
      );

      const refresh = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie);
      expect(refresh.status).toBe(401);
    });
  });
});
