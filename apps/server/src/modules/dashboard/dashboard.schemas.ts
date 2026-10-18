import { z } from 'zod';

export const dashboardQuerySchema = z.object({
  /** Narrow the dashboard to one pillar or objective (any level). */
  elementId: z.uuid().optional(),
});
export type DashboardQuery = z.output<typeof dashboardQuerySchema>;
