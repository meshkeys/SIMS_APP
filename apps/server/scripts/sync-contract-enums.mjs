// Copies the enums Prisma generates into @sims/contracts, so the API contract
// and the database can never disagree. Runs after every `prisma generate`.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(
  new URL('../src/generated/prisma/enums.ts', import.meta.url),
);
const target = fileURLToPath(
  new URL('../../../packages/contracts/src/enums.ts', import.meta.url),
);

const body = readFileSync(source, 'utf8')
  .replace(/^[\s\S]*?(?=export const)/, '')
  .replace(/\r\n/g, '\n')
  .trimEnd();

writeFileSync(
  target,
  `// Generated from prisma/schema.prisma by apps/server/scripts/sync-contract-enums.mjs.\n// Do not edit: change the schema and run \`npm run db:generate\`.\n\n${body}\n`,
);
console.log('Synced enums to @sims/contracts');
