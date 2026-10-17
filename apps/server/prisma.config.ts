import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// One .env at the repo root serves docker-compose and the server.
config({ path: '../../.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // Migrations run as the table owner. The API itself connects with
  // DATABASE_URL (the least-privileged app role) so row-level security applies.
  datasource: {
    url: env('DATABASE_ADMIN_URL'),
  },
});
