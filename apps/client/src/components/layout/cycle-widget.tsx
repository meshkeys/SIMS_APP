import type { PeriodStatus } from '@sims/contracts';
import { useApiQuery } from '@/lib/api/query';

const STAGE_NAMES: Record<PeriodStatus, string> = {
  OPEN: 'Opening',
  OWNER_SUBMISSION: 'Owners submit',
  STRATEGY_REVIEW: 'Strategy Office review',
  SPONSOR_REVIEW: 'Sponsor review',
  LOCKED: 'Locked',
};

/** "October reporting cycle · Day 6 of 8 · Sponsor review", in the sidebar. */
export function CycleWidget() {
  const { data: period } = useApiQuery('getCurrentPeriod', {});
  if (!period) return null;
  const month = period.name.split(' ')[0];
  const day = period.cycleDay;
  return (
    <div className="mx-3 rounded-md border border-sidebar-active px-3 py-3">
      <p className="text-xs text-sidebar-muted">{month} reporting cycle</p>
      <p className="mt-0.5 text-sm font-medium text-white">
        {day ? `Day ${day.day} of ${day.of} · ` : ''}
        {STAGE_NAMES[period.status]}
      </p>
      {day && (
        <progress
          aria-label="Reporting cycle progress"
          max={day.of}
          value={Math.min(day.day, day.of)}
          aria-valuetext={`Day ${day.day} of ${day.of}`}
          className="mt-2 block h-1 w-full appearance-none overflow-hidden rounded-full bg-sidebar-active [&::-moz-progress-bar]:bg-sidebar-text [&::-webkit-progress-bar]:bg-sidebar-active [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-sidebar-text"
        />
      )}
    </div>
  );
}
