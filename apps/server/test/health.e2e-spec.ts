import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './setup/create-app.js';

describe('GET /health', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('is public, unversioned and reports the database as healthy', () =>
    request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', checks: { database: 'up' } }));

  it('tags every response with a request id, reusing a safe incoming one', async () => {
    const generated = await request(app.getHttpServer()).get('/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const echoed = await request(app.getHttpServer())
      .get('/health')
      .set('X-Request-Id', 'lb-trace-12345');
    expect(echoed.headers['x-request-id']).toBe('lb-trace-12345');

    const unsafe = await request(app.getHttpServer())
      .get('/health')
      .set('X-Request-Id', 'bad id with spaces <script>');
    expect(unsafe.headers['x-request-id']).not.toContain('<');
  });

  it('sends security headers', async () => {
    const response = await request(app.getHttpServer()).get('/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('answers unknown routes with a problem+json 404', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/nope');
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});
