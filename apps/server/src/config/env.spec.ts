import { InvalidEnvironmentError, loadEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://sims_app:secret@localhost:5433/sims',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
};

describe('loadEnv', () => {
  it('applies defaults and coerces values', () => {
    const env = loadEnv({ ...valid, PORT: '4000' });

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      DATABASE_URL: valid.DATABASE_URL,
      DATABASE_POOL_MAX: 10,
      JWT_ACCESS_SECRET: valid.JWT_ACCESS_SECRET,
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
      COOKIE_SECURE: false,
      CORS_ORIGINS: ['http://localhost:5173'],
      APP_URL: 'http://localhost:5173',
      SMTP_HOST: 'localhost',
      SMTP_PORT: 1025,
      SMTP_SECURE: false,
      MAIL_FROM: 'SIMS <no-reply@sims.local>',
      TRUST_PROXY: 0,
      RATE_LIMIT_PER_MINUTE: 300,
      RATE_LIMIT_AUTH_PER_MINUTE: 10,
      API_DOCS: true,
    });
  });

  it('turns the API reference off in production unless asked for', () => {
    expect(loadEnv({ ...valid, NODE_ENV: 'production' }).API_DOCS).toBe(false);
    expect(
      loadEnv({ ...valid, NODE_ENV: 'production', API_DOCS: 'true' }).API_DOCS,
    ).toBe(true);
  });

  it('parses comma-separated CORS origins', () => {
    const env = loadEnv({
      ...valid,
      CORS_ORIGINS: 'https://app.sims.app, https://admin.sims.app',
    });
    expect(env.CORS_ORIGINS).toEqual([
      'https://app.sims.app',
      'https://admin.sims.app',
    ]);
  });

  it('defaults secure cookies on in production and refuses to turn them off', () => {
    expect(loadEnv({ ...valid, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(
      true,
    );
    expect(() =>
      loadEnv({ ...valid, NODE_ENV: 'production', COOKIE_SECURE: 'false' }),
    ).toThrow(/COOKIE_SECURE/);
  });

  it('rejects a short JWT secret', () => {
    expect(() => loadEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('rejects a missing database URL', () => {
    expect(() =>
      loadEnv({ JWT_ACCESS_SECRET: valid.JWT_ACCESS_SECRET }),
    ).toThrow(InvalidEnvironmentError);
  });

  it('rejects a non-Postgres database URL', () => {
    expect(() =>
      loadEnv({ ...valid, DATABASE_URL: 'mysql://localhost/sims' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('lists every problem at once', () => {
    try {
      loadEnv({ PORT: 'abc', NODE_ENV: 'staging' });
      expect.fail('expected loadEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEnvironmentError);
      const fields = (error as InvalidEnvironmentError).issues.map(
        (issue) => issue.split(':')[0],
      );
      expect(fields).toEqual(
        expect.arrayContaining([
          'NODE_ENV',
          'PORT',
          'DATABASE_URL',
          'JWT_ACCESS_SECRET',
        ]),
      );
    }
  });
});
