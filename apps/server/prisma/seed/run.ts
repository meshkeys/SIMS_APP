/**
 * `npm run db:seed` — loads the Meridian demo organisation.
 * Safe to re-run: the demo tenant is deleted and recreated in one transaction.
 * Connects as the table owner (DATABASE_ADMIN_URL), never in production.
 */
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedDemo } from './demo/seed-demo.js';

config({ path: ['.env', '../../.env'], quiet: true });

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error('DATABASE_ADMIN_URL is not set');
if (process.env.NODE_ENV === 'production')
  throw new Error('Refusing to load demo data in production');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});
const started = Date.now();
try {
  const summary = await seedDemo(prisma);
  console.log(
    `Seeded demo organisation "${summary.organisationSlug}" in ${Date.now() - started} ms`,
  );
  console.table(summary);
} finally {
  await prisma.$disconnect();
}
