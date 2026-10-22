import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { MAILER } from '../../src/infrastructure/mail/index.js';
import { DEMO_PASSWORD, emailFor } from '../../prisma/seed/demo/people.js';
import { createAdminPool } from '../setup/admin-db.js';
import { cookieFrom, createTestApp } from '../setup/create-app.js';
import { loadDemo } from '../setup/demo.js';
import { FakeMailer } from '../setup/fake-mailer.js';

const AMARA = emailFor('strategyHead');
const HASSAN = emailFor('headDigital');
const AUDITOR = emailFor('auditor');
const NEW_PASSWORD = 'a fresh and long passphrase';

describe('Forgot password (e2e)', () => {
  let app: NestExpressApplication;
  let admin: pg.Pool;
  const mailer = new FakeMailer();

  const http = () => request(app.getHttpServer());
  const post = (path: string, body: object) =>
    http().post(`/api/v1/auth/password-reset/${path}`).send(body);
  const login = (email: string, password: string) =>
    http().post('/api/v1/auth/login').send({ email, password });
  /** Emails go out after the answer; wait for the one expected. */
  const mailCount = (to: string) =>
    mailer.sent.filter((message) => message.to === to).length;
  const waitForMail = (to: string, count: number) =>
    vi.waitFor(() => expect(mailCount(to)).toBe(count));
  /** Lets a new link be asked for straight away (one a minute per account). */
  const ageLinks = (email: string) =>
    admin.query(
      `UPDATE "PasswordResetToken" SET "createdAt" = now() - interval '5 minutes'
       WHERE "userId" = (SELECT id FROM "User" WHERE email = $1)`,
      [email],
    );

  beforeAll(async () => {
    admin = createAdminPool();
    await loadDemo(admin);
    app = await createTestApp({
      overrides: [{ provide: MAILER, useValue: mailer }],
    });
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  it('answers the same for an unknown email, and sends nothing', async () => {
    const response = await post('request', {
      email: 'nobody@nowhere.example',
    });

    expect(response.status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mailCount('nobody@nowhere.example')).toBe(0);
  });

  it('resets the password with the emailed link and signs out every session', async () => {
    const before = cookieFrom(await login(AMARA, DEMO_PASSWORD), 'sims_rt')!;

    const asked = await post('request', { email: ` ${AMARA.toUpperCase()} ` });
    expect(asked.status).toBe(204);
    await waitForMail(AMARA, 1);
    const token = mailer.resetTokenSentTo(AMARA);
    expect(mailer.lastTo(AMARA)!.subject).toBe('Reset your SIMS password');

    const preview = await post('check', { token });
    expect(preview.status).toBe(200);
    expect(preview.body).toEqual({
      email: AMARA,
      expiresAt: expect.any(String),
    });

    const weak = await post('complete', { token, password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.errors[0].path).toBe('password');

    const done = await post('complete', { token, password: NEW_PASSWORD });
    expect(done.status).toBe(204);

    expect((await login(AMARA, DEMO_PASSWORD)).status).toBe(401);
    expect((await login(AMARA, NEW_PASSWORD)).status).toBe(200);
    const refreshed = await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', before);
    expect(refreshed.status).toBe(401);

    await waitForMail(AMARA, 2);
    expect(mailer.lastTo(AMARA)!.subject).toBe(
      'Your SIMS password was changed',
    );

    const again = await post('complete', { token, password: NEW_PASSWORD });
    expect(again.status).toBe(410);
    expect(again.body.code).toBe('RESET_LINK_USED');
    expect((await post('check', { token })).body.code).toBe('RESET_LINK_USED');
  });

  it('sends at most one link a minute, and only the newest link works', async () => {
    await post('request', { email: HASSAN });
    await waitForMail(HASSAN, 1);
    const first = mailer.resetTokenSentTo(HASSAN);

    await post('request', { email: HASSAN });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mailCount(HASSAN)).toBe(1);

    await ageLinks(HASSAN);
    await post('request', { email: HASSAN });
    await waitForMail(HASSAN, 2);
    const second = mailer.resetTokenSentTo(HASSAN);

    expect(second).not.toBe(first);
    const old = await post('check', { token: first });
    expect(old.status).toBe(404);
    expect(old.body.code).toBe('RESET_LINK_INVALID');
    expect((await post('check', { token: second })).status).toBe(200);
  });

  it('refuses an expired link', async () => {
    await post('request', { email: AUDITOR });
    await waitForMail(AUDITOR, 1);
    const token = mailer.resetTokenSentTo(AUDITOR);
    await admin.query(
      `UPDATE "PasswordResetToken" SET "expiresAt" = now() - interval '1 minute'
       WHERE "userId" = (SELECT id FROM "User" WHERE email = $1)`,
      [AUDITOR],
    );

    const response = await post('complete', { token, password: NEW_PASSWORD });

    expect(response.status).toBe(410);
    expect(response.body.code).toBe('RESET_LINK_EXPIRED');
    expect((await login(AUDITOR, DEMO_PASSWORD)).status).toBe(200);
  });

  it('refuses a made-up link', async () => {
    const response = await post('check', {
      token: 'not-a-real-token-but-long-enough',
    });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('RESET_LINK_INVALID');
  });

  it('sends no link to an account that signs in only with single sign-on', async () => {
    const sso = emailFor('auditor');
    await ageLinks(sso);
    await admin.query(
      `UPDATE "User" SET "passwordHash" = NULL WHERE email = $1`,
      [sso],
    );
    const sentBefore = mailCount(sso);

    expect((await post('request', { email: sso })).status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mailCount(sso)).toBe(sentBefore);
  });
});
