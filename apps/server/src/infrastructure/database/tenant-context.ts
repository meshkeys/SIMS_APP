import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';

/**
 * Who a unit of work acts for. Set once per request (by the auth layer, from
 * the verified token) or per background job, and read implicitly by the
 * tenant-scoped database client, so services never pass organisation ids around.
 */
export interface TenantContextData {
  readonly organisationId: string;
  /** The signed-in member; absent for system work such as scheduled jobs. */
  readonly membershipId?: string;
  /** Correlates database work with API logs and audit events. */
  readonly requestId?: string;
}

export class MissingTenantContextError extends Error {
  constructor() {
    super(
      'No tenant context: tenant-scoped database access must run inside TenantContext.run().',
    );
    this.name = 'MissingTenantContextError';
  }
}

const contextSchema = z.object({
  organisationId: z.uuid(),
  membershipId: z.uuid().optional(),
  requestId: z.string().min(1).optional(),
});

const storage = new AsyncLocalStorage<TenantContextData>();

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  );
}

export const TenantContext = {
  /** Runs `fn` (and everything it awaits) on behalf of one organisation. */
  run<T>(context: TenantContextData, fn: () => T): T {
    return storage.run(Object.freeze(contextSchema.parse(context)), () => {
      const result = fn();
      // Prisma queries are lazy: they execute when `.then()` is first called.
      // If `fn` returns an un-awaited query, start it here, inside the
      // context, rather than wherever the caller eventually awaits it.
      return (isThenable(result) ? Promise.resolve(result) : result) as T;
    });
  },

  /** The current context, or undefined outside of `run`. */
  current(): TenantContextData | undefined {
    return storage.getStore();
  },

  /** The current context; throws rather than ever falling back to "no tenant". */
  require(): TenantContextData {
    const context = storage.getStore();
    if (!context) throw new MissingTenantContextError();
    return context;
  },
};
