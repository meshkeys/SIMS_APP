import { config } from 'dotenv';

config({ path: ['.env', '../../.env'], quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env at the repo root.`,
    );
  }
  return value;
}

/** Guard against ever pointing destructive test helpers at a real database. */
function assertTestDatabase(url: string, name: string): string {
  const database = new URL(url).pathname.slice(1);
  if (!database.endsWith('_test')) {
    throw new Error(
      `${name} must point at a database whose name ends in "_test" (got "${database}").`,
    );
  }
  return url;
}

export const TEST_DATABASE_URL = assertTestDatabase(
  required('TEST_DATABASE_URL'),
  'TEST_DATABASE_URL',
);
export const TEST_DATABASE_ADMIN_URL = assertTestDatabase(
  required('TEST_DATABASE_ADMIN_URL'),
  'TEST_DATABASE_ADMIN_URL',
);
