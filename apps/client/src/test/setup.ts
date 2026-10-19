import '@testing-library/jest-dom/vitest';
import { friendlyErrors } from '@sims/contracts';
import { cleanup } from '@testing-library/react';
import { z } from 'zod';

z.config({ customError: friendlyErrors });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
