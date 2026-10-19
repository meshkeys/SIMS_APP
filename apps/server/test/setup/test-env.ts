import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TEST_DATABASE_URL } from './test-database.js';

// Runs before each test file imports app code, so loadEnv() sees the test DB.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DATABASE_URL;
// Suites sign in many times from one IP; the rate-limit suite lowers these itself.
process.env.RATE_LIMIT_PER_MINUTE = '100000';
process.env.RATE_LIMIT_AUTH_PER_MINUTE = '100000';
// Uploaded files go to a throwaway folder, never the developer's own storage.
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = join(tmpdir(), 'sims-e2e-storage');
process.env.UPLOAD_MAX_MB = '1';
