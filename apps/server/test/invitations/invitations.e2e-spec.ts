import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaPg } from '@prisma/adapter-pg';
import type pg from 'pg';
import request from 'supertest';
import { DEMO_PASSWORD, emailFor } from '../../prisma/seed/demo/people.js';
import { seedDemo } from '../../prisma/seed/demo/seed-demo.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { MAILER } from '../../src/infrastructure/mail/index.js';
import { createAdminPool, resetDatabase } from '../setup/admin-db.js';
import { cookieFrom, createTestApp } from '../setup/create-app.js';
import { FakeMailer } from '../setup/fake-mailer.js';
import { TEST_DATABASE_ADMIN_URL } from '../setup/test-database.js';

const AMARA = emailFor('strategyHead'); // Strategy Office + System Admin
const ANALYST = emailFor('strategyAnalyst'); // Strategy Office only
const HASSAN = emailFor('headDigital'); // Initiative owner

describe('Invitations (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  const mailer = new FakeMailer();
  const http = () => request(app.getHttpServer());
  const tokens: Record<string, string> = {};

  const signIn = async (email: string, password = DEMO_PASSWORD) => {
    const response = await http()
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(response.status).toBe(200);
    return response.body.accessToken as string;
  };
  const invite = async (as: string, body: Record<string, unknown>) => {
    // Sign in before starting the next request: supertest requests share one server.
    const token = (tokens[as] ??= await signIn(as));
    return http()
      .post('/api/v1/invitations')
      .auth(token, { type: 'bearer' })
      .send(body);
  };

  beforeAll(async () => {
    admin = createAdminPool();
    await resetDatabase(admin);
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: TEST_DATABASE_ADMIN_URL }),
    });
    await seedDemo(prisma);
    await prisma.$disconnect();
    app = await createTestApp({
      overrides: [{ provide: MAILER, useValue: mailer }],
    });
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  beforeEach(() => {
    mailer.failing = false;
  });

  describe('sending', () => {
    it('invites a new person and emails them a one-time link', async () => {
      const response = await invite(AMARA, {
        email: '  Chidi.Okeke@Example.com ',
        roles: ['INITIATIVE_OWNER', 'INITIATIVE_OWNER'],
        jobTitle: 'Head, Treasury',
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        email: 'chidi.okeke@example.com',
        roles: ['INITIATIVE_OWNER'],
        status: 'PENDING',
        invitedBy: { name: 'Amara Bello' },
        emailDelivered: true,
      });

      const email = mailer.lastTo('chidi.okeke@example.com')!;
      expect(email.subject).toBe(
        'Amara Bello invited you to Meridian Financial Group on SIMS',
      );
      expect(email.text).toContain('Your role: Initiative owner');
      expect(email.html).toContain('Accept invitation');

      // Only a hash is stored: the database never holds a usable link.
      const token = mailer.tokenSentTo('chidi.okeke@example.com');
      const { rows } = await admin.query(
        `SELECT "tokenHash" FROM "Invitation" WHERE email = $1`,
        ['chidi.okeke@example.com'],
      );
      expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0].tokenHash).not.toContain(token);
    });

    it('lets only System Admins and the Strategy Office invite', async () => {
      const response = await invite(HASSAN, {
        email: 'x@example.com',
        roles: ['TASK_OWNER'],
      });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('INSUFFICIENT_ROLE');
    });

    it('stops non-admins from creating administrators', async () => {
      const response = await invite(ANALYST, {
        email: 'eve@example.com',
        roles: ['SYSTEM_ADMIN'],
      });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('CANNOT_GRANT_ROLE');
    });

    it('refuses to invite an existing member', async () => {
      const response = await invite(AMARA, {
        email: HASSAN,
        roles: ['TASK_OWNER'],
      });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('ALREADY_MEMBER');
    });

    it('rejects a department from another organisation (or none)', async () => {
      const response = await invite(AMARA, {
        email: 'dept@example.com',
        roles: ['TASK_OWNER'],
        departmentId: '0199f0a0-0000-7000-8000-00000000dead',
      });
      expect(response.status).toBe(400);
      expect(response.body.errors[0].path).toBe('departmentId');
    });

    it('keeps the invitation when email delivery fails, and reports it', async () => {
      mailer.failing = true;
      const response = await invite(AMARA, {
        email: 'outage@example.com',
        roles: ['TASK_OWNER'],
      });

      expect(response.status).toBe(201);
      expect(response.body.emailDelivered).toBe(false);

      mailer.failing = false;
      const resent = await http()
        .post(`/api/v1/invitations/${response.body.id}/resend`)
        .auth(tokens[AMARA], { type: 'bearer' });
      expect(resent.status).toBe(200);
      expect(resent.body.emailDelivered).toBe(true);
      expect(mailer.lastTo('outage@example.com')).toBeDefined();
    });

    it('enforces the subscription seat limit, counting pending invitations', async () => {
      await admin.query(
        `UPDATE "Subscription" s SET seats = (
           SELECT count(*) FROM "Membership" m WHERE m."organisationId" = s."organisationId" AND m.status = 'ACTIVE'
         ) + (
           SELECT count(*) FROM "Invitation" i WHERE i."organisationId" = s."organisationId"
             AND i."acceptedAt" IS NULL AND i."revokedAt" IS NULL AND i."expiresAt" > now()
         )
         FROM "Organisation" o WHERE o.id = s."organisationId" AND o.slug = 'meridian'`,
      );
      const response = await invite(AMARA, {
        email: 'one-too-many@example.com',
        roles: ['TASK_OWNER'],
      });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('SEAT_LIMIT_REACHED');

      await admin.query(`UPDATE "Subscription" SET seats = 200`);
    });
  });

  describe('accepting as a new person', () => {
    it('shows the invitation on the public accept page', async () => {
      const response = await http()
        .post('/api/v1/invitations/lookup')
        .send({ token: mailer.tokenSentTo('chidi.okeke@example.com') });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        organisationName: 'Meridian Financial Group',
        email: 'chidi.okeke@example.com',
        roles: ['INITIATIVE_OWNER'],
        jobTitle: 'Head, Treasury',
        invitedByName: 'Amara Bello',
        expiresAt: expect.any(String),
        accountExists: false,
      });
    });

    it('requires a name and a strong password for a new account', async () => {
      const response = await http()
        .post('/api/v1/invitations/accept')
        .send({
          token: mailer.tokenSentTo('chidi.okeke@example.com'),
          password: 'short',
        });

      expect(response.status).toBe(400);
      expect(response.body.errors.map((e: { path: string }) => e.path)).toEqual(
        expect.arrayContaining(['name', 'password']),
      );
    });

    it('creates the account, joins the organisation and signs in', async () => {
      const token = mailer.tokenSentTo('chidi.okeke@example.com');
      const response = await http()
        .post('/api/v1/invitations/accept')
        .send({ token, name: 'Chidi Okeke', password: 'a-long-new-password' });

      expect(response.status).toBe(200);
      expect(response.body.session).toMatchObject({
        user: { name: 'Chidi Okeke', email: 'chidi.okeke@example.com' },
        organisation: { slug: 'meridian' },
        membership: { roles: ['INITIATIVE_OWNER'], jobTitle: 'Head, Treasury' },
      });
      expect(cookieFrom(response, 'sims_rt')).toBeDefined();

      const { rows } = await admin.query(
        `SELECT "emailVerifiedAt" IS NOT NULL AS verified FROM "User" WHERE email = $1`,
        ['chidi.okeke@example.com'],
      );
      expect(rows[0].verified).toBe(true);

      // The new member can sign in normally afterwards.
      await signIn('chidi.okeke@example.com', 'a-long-new-password');
    });

    it('works only once', async () => {
      const response = await http()
        .post('/api/v1/invitations/accept')
        .send({
          token: mailer.tokenSentTo('chidi.okeke@example.com'),
          name: 'Chidi Okeke',
          password: 'a-long-new-password',
        });

      expect(response.status).toBe(410);
      expect(response.body.code).toBe('INVITATION_USED');
    });
  });

  describe('accepting with an existing account', () => {
    it('adds a workspace to someone who already uses SIMS elsewhere', async () => {
      const signup = await http().post('/api/v1/auth/signup').send({
        organisationName: 'Northwind Advisory',
        sector: 'PRIVATE',
        country: 'NG',
        name: 'Ife Adeola',
        email: 'ife@northwind.example',
        password: 'northwind-password',
      });
      expect(signup.status).toBe(201);

      await invite(AMARA, { email: 'ife@northwind.example', roles: ['BOARD'] });
      const token = mailer.tokenSentTo('ife@northwind.example');

      const preview = await http()
        .post('/api/v1/invitations/lookup')
        .send({ token });
      expect(preview.body.accountExists).toBe(true);

      const wrong = await http()
        .post('/api/v1/invitations/accept')
        .send({ token, password: 'not-my-password' });
      expect(wrong.status).toBe(401);

      const accepted = await http()
        .post('/api/v1/invitations/accept')
        .send({ token, password: 'northwind-password' });
      expect(accepted.status).toBe(200);
      expect(accepted.body.session.organisation.slug).toBe('meridian');
      expect(
        accepted.body.session.organisations
          .map((o: { slug: string }) => o.slug)
          .sort(),
      ).toEqual(['meridian', 'northwind-advisory']);
    });
  });

  describe('link lifecycle', () => {
    it('replaces an earlier invitation when the same address is invited again', async () => {
      await invite(AMARA, {
        email: 'twice@example.com',
        roles: ['TASK_OWNER'],
      });
      const first = mailer.tokenSentTo('twice@example.com');
      await invite(AMARA, {
        email: 'twice@example.com',
        roles: ['EXECUTIVE_SPONSOR'],
      });
      const second = mailer.tokenSentTo('twice@example.com');

      expect(
        (await http().post('/api/v1/invitations/lookup').send({ token: first }))
          .status,
      ).toBe(410);
      const latest = await http()
        .post('/api/v1/invitations/lookup')
        .send({ token: second });
      expect(latest.body.roles).toEqual(['EXECUTIVE_SPONSOR']);
    });

    it('stops working once revoked', async () => {
      const sent = await invite(AMARA, {
        email: 'revoked@example.com',
        roles: ['TASK_OWNER'],
      });
      const token = mailer.tokenSentTo('revoked@example.com');

      const revoke = await http()
        .delete(`/api/v1/invitations/${sent.body.id}`)
        .auth(tokens[AMARA], { type: 'bearer' });
      expect(revoke.status).toBe(204);

      const lookup = await http()
        .post('/api/v1/invitations/lookup')
        .send({ token });
      expect(lookup.body.code).toBe('INVITATION_USED');
    });

    it('expires', async () => {
      await invite(AMARA, { email: 'late@example.com', roles: ['TASK_OWNER'] });
      await admin.query(
        `UPDATE "Invitation" SET "expiresAt" = now() - interval '1 minute' WHERE email = 'late@example.com'`,
      );

      const response = await http()
        .post('/api/v1/invitations/lookup')
        .send({ token: mailer.tokenSentTo('late@example.com') });
      expect(response.status).toBe(410);
      expect(response.body.code).toBe('INVITATION_EXPIRED');
    });

    it('rejects an unknown token without revealing anything', async () => {
      const response = await http()
        .post('/api/v1/invitations/lookup')
        .send({ token: 'this-token-does-not-exist-anywhere' });
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('INVITATION_NOT_FOUND');
    });
  });

  describe('listing', () => {
    it('lists the organisation’s invitations with their status', async () => {
      const response = await http()
        .get('/api/v1/invitations')
        .auth(tokens[AMARA], { type: 'bearer' });

      expect(response.status).toBe(200);
      // Newest first: keep each address's latest invitation (a re-invite
      // leaves the replaced one behind as REVOKED).
      const byEmail: Record<string, string> = {};
      for (const i of response.body as { email: string; status: string }[]) {
        byEmail[i.email] ??= i.status;
      }
      expect(byEmail).toMatchObject({
        'chidi.okeke@example.com': 'ACCEPTED',
        'revoked@example.com': 'REVOKED',
        'late@example.com': 'EXPIRED',
        'twice@example.com': 'PENDING',
      });
    });

    it('never shows another organisation’s invitations', async () => {
      const northwind = await signIn(
        'ife@northwind.example',
        'northwind-password',
      );
      const response = await http()
        .get('/api/v1/invitations')
        .auth(northwind, { type: 'bearer' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });
});
