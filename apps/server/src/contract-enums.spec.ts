import * as contract from '@sims/contracts';
import * as database from './generated/prisma/enums.js';

describe('@sims/contracts enums', () => {
  it('match the database schema exactly (run `npm run db:generate` if not)', () => {
    const enums = Object.entries(database).filter(
      ([, value]) => typeof value === 'object',
    );
    expect(enums.length).toBeGreaterThan(30);
    for (const [name, values] of enums) {
      expect(
        contract[name as keyof typeof contract],
        `${name} is missing from @sims/contracts`,
      ).toEqual(values);
    }
  });
});
