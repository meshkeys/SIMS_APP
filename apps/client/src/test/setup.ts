import '@testing-library/jest-dom/vitest';
import { friendlyErrors } from '@sims/contracts';
import { cleanup, configure } from '@testing-library/react';
import { z } from 'zod';

z.config({ customError: friendlyErrors });

// Screens load on demand; under a full parallel run the first render of a
// screen can take over a second, so allow findBy* queries up to 5 seconds.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
