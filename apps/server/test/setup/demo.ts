import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaPg } from '@prisma/adapter-pg';
import type pg from 'pg';
import request from 'supertest';
import { DEMO_PASSWORD } from '../../prisma/seed/demo/people.js';
import { seedDemo } from '../../prisma/seed/demo/seed-demo.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { resetDatabase } from './admin-db.js';
import { TEST_DATABASE_ADMIN_URL } from './test-database.js';

/** Empties the test database and loads the Meridian demo organisation. */
export async function loadDemo(admin: pg.Pool): Promise<void> {
  await resetDatabase(admin);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DATABASE_ADMIN_URL }),
  });
  try {
    await seedDemo(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/** Signs in and returns the access token (cached per email). */
export function signInAs(app: NestExpressApplication) {
  const cache = new Map<string, string>();
  return async (email: string, password = DEMO_PASSWORD): Promise<string> => {
    const cached = cache.get(email);
    if (cached) return cached;
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
    if (response.status !== 200) {
      throw new Error(
        `Sign-in failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`,
      );
    }
    cache.set(email, response.body.accessToken);
    return response.body.accessToken as string;
  };
}
