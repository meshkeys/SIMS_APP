import { ExecutionContext, SetMetadata } from '@nestjs/common';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Env } from '../../config/env.js';

export const STRICT_RATE_LIMIT = 'rateLimit:strict';

/**
 * Applies the strict limit (RATE_LIMIT_AUTH_PER_MINUTE) to a route, on top of
 * the general one. Use on endpoints that attackers hammer: sign-in, sign-up,
 * token refresh, password reset.
 */
export const StrictRateLimit = () => SetMetadata(STRICT_RATE_LIMIT, true);

const isStrict = (context: ExecutionContext): boolean =>
  Reflect.getMetadata(STRICT_RATE_LIMIT, context.getHandler()) === true;

/**
 * Per-client-IP limits. Counters are in memory per instance for now; they
 * move to Redis with the jobs module so limits hold across instances.
 */
export const rateLimitOptions = (env: Env): ThrottlerModuleOptions => ({
  errorMessage: 'Too many requests. Please wait a minute and try again.',
  throttlers: [
    { name: 'default', ttl: 60_000, limit: env.RATE_LIMIT_PER_MINUTE },
    {
      name: 'strict',
      ttl: 60_000,
      limit: env.RATE_LIMIT_AUTH_PER_MINUTE,
      skipIf: (context) => !isStrict(context),
    },
  ],
});
