import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // Migrates the test database once per run.
    globalSetup: ['./test/setup/global-setup.ts'],
    // Points DATABASE_URL at the test database before any app code loads.
    // Then fails any file whose responses break @sims/contracts.
    setupFiles: [
      './test/setup/test-env.ts',
      './test/setup/contract-afterall.ts',
    ],
    // Suites share one database; run files one at a time.
    fileParallelism: false,
    hookTimeout: 60_000,
  },
});
