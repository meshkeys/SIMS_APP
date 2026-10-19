import type { Health, Severity, Trajectory } from '@sims/contracts';

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

/** How a KPI's trajectory reads and looks (scorecards, initiative impact). */
export const TRAJECTORY_DISPLAY: Record<
  Trajectory,
  { label: string; tone: Tone }
> = {
  ON_TRAJECTORY: { label: 'On trajectory', tone: 'success' },
  SLIGHTLY_BEHIND: { label: 'Slightly behind', tone: 'warning' },
  OFF_TRAJECTORY: { label: 'Off trajectory', tone: 'danger' },
  NOT_MEASURABLE: { label: 'Not yet measurable', tone: 'neutral' },
};

/** How a risk, issue or escalation's severity reads and looks. */
export const SEVERITY_DISPLAY: Record<Severity, { label: string; tone: Tone }> =
  {
    CRITICAL: { label: 'Critical', tone: 'danger' },
    HIGH: { label: 'High', tone: 'warning' },
    MEDIUM: { label: 'Medium', tone: 'neutral' },
    LOW: { label: 'Low', tone: 'neutral' },
  };
