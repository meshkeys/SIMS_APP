import { Health } from '@sims/contracts';
import { z } from 'zod';

/** Sort orders the register offers, as people say them. */
export const SORTS = {
  health: 'Health, then due date',
  due: 'Due date (soonest first)',
  '-due': 'Due date (latest first)',
  variance: 'Furthest behind plan',
  code: 'ID',
} as const;

/**
 * The register's filters, kept in the URL so any view can be bookmarked or
 * shared. Bad values (e.g. an edited link) fall back to defaults rather than
 * breaking the page.
 */
export const registerSearchSchema = z.object({
  tab: z
    .enum(['active', 'pipeline', 'closed', 'cancelled'])
    .optional()
    .catch(undefined),
  health: z.enum(Health).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  elementId: z.uuid().optional().catch(undefined),
  sort: z
    .enum(Object.keys(SORTS) as [keyof typeof SORTS, ...(keyof typeof SORTS)[]])
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});
export type RegisterSearch = z.output<typeof registerSearchSchema>;
