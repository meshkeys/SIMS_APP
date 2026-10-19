import type { Health } from '@sims/contracts';

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

/** How each health status reads and looks everywhere in the app. */
export const HEALTH_DISPLAY: Record<Health, { label: string; tone: Tone }> = {
  GREEN: { label: 'On track', tone: 'success' },
  AMBER: { label: 'At risk', tone: 'warning' },
  RED: { label: 'Delayed', tone: 'danger' },
  UNKNOWN: { label: 'Unknown', tone: 'neutral' },
};

/** How an objective's rolled-up health reads on the strategy map. */
export const OBJECTIVE_HEALTH_WORDS: Record<Health, string> = {
  GREEN: 'healthy',
  AMBER: 'watch',
  RED: 'off track',
  UNKNOWN: 'not yet measured',
};
