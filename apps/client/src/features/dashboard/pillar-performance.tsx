import type { ElementPerformance } from '@sims/contracts';
import { Link } from '@tanstack/react-router';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Meter } from '@/components/ui/meter';
import { EmptyState } from '@/components/ui/states';
import { formatPercent, plural } from '@/lib/format';

/** Execution (navy) and strategic impact (ochre) per pillar — two independent lenses. */
export function PillarPerformance({
  rows,
  scoped,
}: {
  rows: ElementPerformance[];
  /** True when the dashboard is narrowed: rows are then objectives. */
  scoped: boolean;
}) {
  return (
    <Card aria-labelledby="pillars-title">
      <CardHeader
        titleId="pillars-title"
        title={
          scoped ? 'Objective performance' : 'Strategic pillar performance'
        }
        description="Two independent lenses: are we delivering, and is it creating value?"
        action={<Legend />}
      />
      <CardBody className="pt-3">
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing to show yet"
            description="Add pillars and objectives on the strategy map to see their performance here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row.id}
                className="grid gap-3 py-4 first:pt-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center"
              >
                <div className="min-w-0">
                  <Link
                    to="/"
                    search={{ elementId: row.id }}
                    className="font-medium text-ink hover:underline"
                  >
                    {row.title}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    {plural(row.initiatives, 'initiative')} · {row.delayed}{' '}
                    delayed
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Score
                    value={row.executionScore}
                    tone="execution"
                    label={`Execution, ${row.title}`}
                  />
                  <Score
                    value={row.impactScore}
                    tone="impact"
                    label={`Strategic impact, ${row.title}`}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function Score({
  value,
  tone,
  label,
}: {
  value: number | null;
  tone: 'execution' | 'impact';
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Meter value={value} tone={tone} label={label} className="flex-1" />
      <span className="tabular w-11 text-right text-sm font-medium text-ink">
        {formatPercent(value)}
      </span>
    </div>
  );
}

function Legend() {
  return (
    <ul aria-hidden="true" className="flex gap-4 text-xs text-ink-muted">
      <li className="flex items-center gap-1.5">
        <span className="h-1.5 w-4 rounded-full bg-primary" /> Execution
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-1.5 w-4 rounded-full bg-impact" /> Strategic impact
      </li>
    </ul>
  );
}
