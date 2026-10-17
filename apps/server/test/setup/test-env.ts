import { TEST_DATABASE_URL } from './test-database.js';

// Runs before each test file imports app code, so loadEnv() sees the test DB.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DATABASE_URL;
