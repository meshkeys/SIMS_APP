import { contractViolations } from './contract-check.js';

// Fails a test file if any response it produced did not match its contract.
afterAll(() => {
  const found = [...new Set(contractViolations)];
  contractViolations.length = 0;
  expect(found, 'responses that do not match @sims/contracts').toEqual([]);
});
