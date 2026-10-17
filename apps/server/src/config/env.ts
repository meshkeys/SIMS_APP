import { config } from 'dotenv';
import { z } from 'zod';

// Local development keeps one .env at the repo root (shared with
// docker-compose). Workspace scripts run from apps/server, so look there too.
// Real environment variables always win: dotenv never overrides them.
config({ path: ['.env', '../../.env'], quiet: true });

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

const commaList = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    /** Runtime connection as the least-privileged app role (RLS applies). */
    DATABASE_URL: postgresUrl,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    /** HMAC key for access tokens. Generate with: openssl rand -base64 48 */
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'must be at least 32 characters (use: openssl rand -base64 48)'),
    /** Short-lived on purpose: role changes and deactivations apply within this window. */
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(3600)
      .default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    /** Send the refresh cookie only over HTTPS. Defaults to true in production. */
    COOKIE_SECURE: z.stringbool().optional(),
    /** Browser origins allowed to call the API with credentials. */
    CORS_ORIGINS: commaList.default(['http://localhost:5173']),
    /** Reverse proxies in front of the API (load balancer = 1), so client IPs are correct. */
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    /** Requests per minute per client IP, all endpoints. */
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
    /** Requests per minute per client IP on sign-up, sign-in and refresh. */
    RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  }))
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'must be true in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvironmentError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

/** Parses and validates configuration. Fails fast at boot, never at request time. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new InvalidEnvironmentError(
      result.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    );
  }
  return result.data;
}
