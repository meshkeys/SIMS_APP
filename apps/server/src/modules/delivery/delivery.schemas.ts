import { z } from 'zod';
import { Health } from '../../generated/prisma/enums.js';

/** Register tabs, matching the screen: Active · Pipeline · Closed · Cancelled. */
export const REGISTER_TABS = {
  active: ['ACTIVE', 'ON_HOLD'],
  pipeline: ['DRAFT', 'PROPOSED', 'APPROVED'],
  closed: ['CLOSED'],
  cancelled: ['CANCELLED'],
} as const;
export type RegisterTab = keyof typeof REGISTER_TABS;

/** "RED,AMBER" → ['RED', 'AMBER'] */
const healthList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.enum(Health)));

export const registerQuerySchema = z.object({
  tab: z.enum(['active', 'pipeline', 'closed', 'cancelled']).default('active'),
  /** One or more effective health values, e.g. `health=RED,AMBER`. */
  health: healthList.optional(),
  /** Any strategy element: initiatives whose home element is it or below it. */
  elementId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
  /** Matches code, title, owner name or owner job title. */
  q: z.string().trim().min(1).max(100).optional(),
  /** health (default: worst first, then due date) · due · -due · code · variance (furthest behind first). */
  sort: z.enum(['health', 'due', '-due', 'code', 'variance']).default('health'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  /** Plan to list; defaults to the current plan. */
  planId: z.uuid().optional(),
});
export type RegisterQuery = z.output<typeof registerQuerySchema>;

export const overrideSchema = z.object({
  health: z.enum(['GREEN', 'AMBER', 'RED']),
  reason: z
    .string()
    .trim()
    .min(10, 'Explain the override in at least 10 characters')
    .max(1000),
  /** Defaults to the longest the organisation allows. */
  expiresAt: z.iso.date().optional(),
});
export type OverrideInput = z.output<typeof overrideSchema>;

export const idSchema = z.uuid();
