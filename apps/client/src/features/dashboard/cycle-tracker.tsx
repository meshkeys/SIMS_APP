import type { CycleStageKey, Dashboard } from '@sims/contracts';
import { Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { formatInstantDay } from '@/lib/format';

type Cycle = NonNullable<Dashboard['cycle']>;

const STAGE_NAMES: Record<CycleStageKey, string> = {
  OWNER_SUBMISSION: 'Owners submit',
  STRATEGY_REVIEW: 'Strategy Office review',
  SPONSOR_REVIEW: 'Sponsor review',
  REPORT_ISSUE: 'Report issued',
};

/** What each stage reports: "29 of 32 in", "6 challenged", "3 pending". */
function stageDetail(key: CycleStageKey, cycle: Cycle): string {
  const { counts } = cycle;
  switch (key) {
    case 'OWNER_SUBMISSION':
      return `${counts.in} of ${counts.owed} in`;
    case 'STRATEGY_REVIEW':
      return `${counts.challenged} challenged`;
    case 'SPONSOR_REVIEW':
      return `${counts.awaitingSponsor} pending`;
    case 'REPORT_ISSUE':
      return 'Locked into the report';
  }
}

/** "October cycle: ✓ Owners submit · ✓ Strategy Office review · ● Sponsor review · ○ Report issued" */
export function CycleTracker({
  cycle,
  timeZone,
}: {
  cycle: Cycle | null;
  timeZone: string;
}) {
  if (!cycle) {
    return (
      <Card className="px-5 py-4 text-sm text-ink-muted">
        No reporting cycle is open. The Strategy Office opens the next one.
      </Card>
    );
  }
  return (
    <Card aria-labelledby="cycle-title" className="px-5 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <h2 id="cycle-title" className="shrink-0 text-sm font-semibold lg:w-32">
          {cycle.name.split(' ')[0]} cycle
        </h2>
        <ol className="grid flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cycle.stages.map((stage) => (
            <li
              key={stage.key}
              className="flex items-start gap-3"
              aria-current={stage.state === 'CURRENT' ? 'step' : undefined}
            >
              <StageIcon state={stage.state} />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-ink">
                  {STAGE_NAMES[stage.key]}
                  <span className="sr-only">
                    {stage.state === 'DONE'
                      ? ' (done)'
                      : stage.state === 'CURRENT'
                        ? ' (in progress)'
                        : ' (upcoming)'}
                  </span>
                </p>
                <p className="text-xs text-ink-muted">
                  {stage.dueAt &&
                    `Due ${formatInstantDay(stage.dueAt, timeZone)} · `}
                  {stageDetail(stage.key, cycle)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

function StageIcon({ state }: { state: 'DONE' | 'CURRENT' | 'UPCOMING' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
        state === 'DONE' && 'border-primary bg-primary text-white',
        state === 'CURRENT' && 'border-primary',
        state === 'UPCOMING' && 'border-border-strong',
      )}
    >
      {state === 'DONE' && <Check className="size-3" strokeWidth={3} />}
      {state === 'CURRENT' && (
        <span className="size-2 rounded-full bg-primary" />
      )}
    </span>
  );
}
