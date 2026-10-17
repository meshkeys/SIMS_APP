import { InvalidEnvironmentError, loadEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://sims_app:secret@localhost:5433/sims',
};

describe('loadEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = loadEnv({ ...valid, PORT: '4000' });

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      DATABASE_URL: valid.DATABASE_URL,
      DATABASE_POOL_MAX: 10,
    });
  });

  it('rejects a missing database URL', () => {
    expect(() => loadEnv({})).toThrow(InvalidEnvironmentError);
  });

  it('rejects a non-Postgres database URL', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://localhost/sims' })).toThrow(
      /DATABASE_URL/,
    );
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
        expect.arrayContaining(['NODE_ENV', 'PORT', 'DATABASE_URL']),
      );
    }
  });
});
