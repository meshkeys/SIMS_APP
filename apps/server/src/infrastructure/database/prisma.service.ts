import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaClient } from '../../generated/prisma/client.js';

/**
 * The raw Prisma client, connected as the least-privileged app role.
 *
 * Do NOT use it for business data: it sets no tenant, so row-level security
 * returns no rows (fail closed). Feature code uses {@link TenantPrismaService}.
 * This client is for infrastructure only (health checks, the auth module's
 * tightly scoped cross-tenant lookups).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        max: env.DATABASE_POOL_MAX,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Cheap round-trip used by health checks. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
