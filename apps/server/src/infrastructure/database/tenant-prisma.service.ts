import { Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';
import { TenantContext } from './tenant-context.js';

/**
 * Wraps every model operation in a short transaction that first tells
 * Postgres which organisation is acting:
 *
 *   BEGIN; SELECT set_config('app.current_org', $1, true); <query>; COMMIT;
 *
 * Row-level security policies read that setting, so a query can only ever
 * see and write the current tenant's rows, even if a `where` clause is
 * forgotten. `true` scopes the setting to the transaction, so pooled
 * connections (and PgBouncer in transaction mode) never leak it.
 */
export function createTenantClient(base: PrismaClient) {
  return base.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const { organisationId } = TenantContext.require();
          const [, result] = await base.$transaction([
            setCurrentOrg(base, organisationId),
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof createTenantClient>;
export type TenantTransactionClient = Prisma.TransactionClient;

export interface TenantTransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

function setCurrentOrg(
  client: Pick<PrismaClient, '$executeRaw'>,
  organisationId: string,
) {
  return client.$executeRaw`SELECT set_config('app.current_org', ${organisationId}, true)`;
}

/**
 * The database entry point for all feature code.
 *
 * - `db.client.initiative.findMany(...)` for single operations.
 * - `db.transaction(async (tx) => { ... })` when several writes must succeed
 *   or fail together, or for raw SQL (raw queries are not covered by the
 *   per-operation wrapper, so always run them inside `transaction`).
 *
 * Both throw MissingTenantContextError outside TenantContext.run().
 */
@Injectable()
export class TenantPrismaService {
  readonly client: TenantPrismaClient;

  constructor(private readonly base: PrismaService) {
    this.client = createTenantClient(base);
  }

  async transaction<T>(
    fn: (tx: TenantTransactionClient) => Promise<T>,
    options?: TenantTransactionOptions,
  ): Promise<T> {
    const { organisationId } = TenantContext.require();
    return this.base.$transaction(async (tx) => {
      await setCurrentOrg(tx, organisationId);
      return fn(tx);
    }, options);
  }
}
