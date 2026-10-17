import { execSync } from 'node:child_process';
import { TEST_DATABASE_ADMIN_URL } from './test-database.js';

/** Brings the test database up to the latest migration before the suites run. */
export default function setup(): void {
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_ADMIN_URL: TEST_DATABASE_ADMIN_URL },
  });
}
