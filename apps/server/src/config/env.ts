import { config } from 'dotenv';
import { z } from 'zod';

// Local development keeps one .env at the repo root (shared with
// docker-compose). Workspace scripts run from apps/server, so look there too.
// Real environment variables always win: dotenv never overrides them.
config({ path: ['.env', '../../.env'], quiet: true });

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  /** Runtime connection as the least-privileged app role (RLS applies). */
  DATABASE_URL: postgresUrl,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
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
