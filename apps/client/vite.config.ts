import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const contracts = fileURLToPath(
  new URL('../../packages/contracts/src/index.ts', import.meta.url),
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // `@/…` → src/… (from tsconfig paths).
    tsconfigPaths: true,
    // Use the contract's source, so edits there reload the app instantly.
    alias: { '@sims/contracts': contracts },
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries change less often than app code: cache them separately.
        advancedChunks: { groups: [{ name: 'vendor', test: /node_modules/ }] },
      },
    },
  },
  server: {
    port: 5173,
    // Same origin as the API in development, so the refresh cookie
    // (SameSite=Strict, path /api/v1/auth) just works.
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
