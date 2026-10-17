import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from '../setup/create-app.js';

describe('Rate limiting (e2e)', () => {
  let app: NestExpressApplication;
  const original = process.env.RATE_LIMIT_AUTH_PER_MINUTE;

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_PER_MINUTE = '3';
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    process.env.RATE_LIMIT_AUTH_PER_MINUTE = original;
  });

  it('slows down repeated sign-in attempts with a 429', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'someone@example.com', password: 'guess' });

    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await attempt()).status);
    expect(statuses).toEqual([401, 401, 401, 429]);

    const limited = await attempt();
    expect(limited.body).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('does not apply the strict limit to the health check', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).get('/health').expect(200);
    }
  });
});
