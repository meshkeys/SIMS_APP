import type { Health } from '@sims/contracts';

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

/** How each health status reads and looks everywhere in the app. */
export const HEALTH_DISPLAY: Record<Health, { label: string; tone: Tone }> = {
  GREEN: { label: 'On track', tone: 'success' },
  AMBER: { label: 'At risk', tone: 'warning' },
  RED: { label: 'Delayed', tone: 'danger' },
  UNKNOWN: { label: 'Unknown', tone: 'neutral' },
};
