import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { MAILER } from '../../src/infrastructure/mail/index.js';
import { createAdminPool, resetDatabase } from '../setup/admin-db.js';
import { createTestApp } from '../setup/create-app.js';
import { FakeMailer } from '../setup/fake-mailer.js';

describe('Confirming an email address (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  const mailer = new FakeMailer();

  const http = () => request(app.getHttpServer());
  const mailCount = (to: string) =>
    mailer.sent.filter((message) => message.to === to).length;
  const waitForMail = (to: string, count: number) =>
    vi.waitFor(() => expect(mailCount(to)).toBe(count));
  const signup = (email: string, organisationName: string) =>
    http().post('/api/v1/auth/signup').send({
      organisationName,
      sector: 'PRIVATE',
      country: 'GH',
      name: 'Efua Asante',
      email,
      password: 'coastal-passphrase-2026',
    });
  const verify = (token: string) =>
    http().post('/api/v1/auth/verify-email').send({ token });
  const me = (bearer: string) =>
    http().get('/api/v1/auth/me').auth(bearer, { type: 'bearer' });
  const resend = (bearer: string) =>
    http()
      .post('/api/v1/auth/verify-email/resend')
      .auth(bearer, { type: 'bearer' });

  beforeAll(async () => {
    admin = createAdminPool();
    await resetDatabase(admin);
    app = await createTestApp({
      overrides: [{ provide: MAILER, useValue: mailer }],
    });
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  it('welcomes a new founder and confirms the address from the link', async () => {
    const email = 'efua@coastal.example';
    const created = await signup(email, 'Coastal Microfinance');
    expect(created.status).toBe(201);
    expect(created.body.session.user.emailVerified).toBe(false);
    const bearer = created.body.accessToken as string;

    await waitForMail(email, 1);
    const welcome = mailer.lastTo(email)!;
    expect(welcome.subject).toBe(
      'Welcome to SIMS: confirm your email for Coastal Microfinance',
    );
    const token = mailer.verifyTokenSentTo(email);

    const confirmed = await verify(token);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toEqual({ email });
    expect((await me(bearer)).body.user.emailVerified).toBe(true);

    // Opening the link again is harmless.
    expect((await verify(token)).status).toBe(200);

    const late = await resend(bearer);
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('ALREADY_VERIFIED');
  });

  it('sends a new link on request, at most one a minute, replacing the old one', async () => {
    const email = 'kwame@harbour.example';
    const bearer = (await signup(email, 'Harbour Savings')).body
      .accessToken as string;
    await waitForMail(email, 1);
    const first = mailer.verifyTokenSentTo(email);

    // The welcome link was made seconds ago.
    const tooSoon = await resend(bearer);
    expect(tooSoon.status).toBe(429);

    await admin.query(
      `UPDATE "EmailVerificationToken" SET "createdAt" = now() - interval '5 minutes'
       WHERE "userId" = (SELECT id FROM "User" WHERE email = $1)`,
      [email],
    );
    expect((await resend(bearer)).status).toBe(204);
    await waitForMail(email, 2);
    expect(mailer.lastTo(email)!.subject).toBe('Confirm your email for SIMS');
    const second = mailer.verifyTokenSentTo(email);

    const old = await verify(first);
    expect(old.status).toBe(404);
    expect(old.body.code).toBe('VERIFY_LINK_INVALID');
    expect((await verify(second)).status).toBe(200);
  });

  it('refuses an expired link', async () => {
    const email = 'ama@lagoon.example';
    await signup(email, 'Lagoon Credit');
    await waitForMail(email, 1);
    const token = mailer.verifyTokenSentTo(email);
    await admin.query(
      `UPDATE "EmailVerificationToken" SET "expiresAt" = now() - interval '1 minute'
       WHERE "userId" = (SELECT id FROM "User" WHERE email = $1)`,
      [email],
    );

    const response = await verify(token);

    expect(response.status).toBe(410);
    expect(response.body.code).toBe('VERIFY_LINK_EXPIRED');
  });

  it('never fails sign-up when email is down', async () => {
    mailer.failing = true;
    try {
      const response = await signup('yaw@reef.example', 'Reef Partners');
      expect(response.status).toBe(201);
    } finally {
      mailer.failing = false;
    }
  });
});
