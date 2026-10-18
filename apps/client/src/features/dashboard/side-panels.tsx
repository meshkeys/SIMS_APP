import type { Dashboard } from '@sims/contracts';
import { Link } from '@tanstack/react-router';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { dateParts, plural } from '@/lib/format';

/** Open escalations, highest level first, with the ladder's own level names. */
export function EscalationsPanel({
  escalations,
}: {
  escalations: Dashboard['escalations'];
}) {
  return (
    <Card aria-labelledby="escalations-title">
      <CardHeader
        titleId="escalations-title"
        title="Escalations"
        description={
          escalations.total > 0
            ? escalations.byLevel
                .filter((l) => l.count > 0)
                .map((l) => `${l.count} at ${l.name}`)
                .join(' · ')
            : undefined
        }
        action={
          <Link
            to="/risks"
            className="text-primary underline underline-offset-4"
          >
            Escalation centre
          </Link>
        }
      />
      <CardBody className="pt-3">
        {escalations.items.length === 0 ? (
          <EmptyState title="No open escalations" />
        ) : (
          <ul className="flex flex-col gap-4">
            {escalations.items.map((item) => (
              <li key={item.id} className="flex gap-3">
                <span
                  className="mt-0.5 h-fit shrink-0 rounded border border-danger/40 bg-danger-soft px-1.5 font-mono text-xs text-danger"
                  title={item.levelName}
                >
                  <span aria-hidden="true">L{item.level}</span>
                  <span className="sr-only">Level {item.level}</span>
                </span>
                <div className="min-w-0 text-sm">
                  <p className="text-ink">{item.title}</p>
                  <p className="text-xs text-ink-muted">
                    Open {plural(item.ageDays, 'day')} · {item.levelName}
                    {item.initiative && ` · ${item.initiative.code}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/** Open milestones due in the next 14 days, soonest first. */
export function MilestonesPanel({
  milestones,
}: {
  milestones: Dashboard['milestones'];
}) {
  return (
    <Card aria-labelledby="milestones-title">
      <CardHeader
        titleId="milestones-title"
        title="Milestones · next 14 days"
        description={
          milestones.overdue > 0
            ? `${plural(milestones.overdue, 'milestone')} already overdue`
            : undefined
        }
      />
      <CardBody className="pt-3">
        {milestones.items.length === 0 ? (
          <EmptyState title="Nothing due in the next two weeks" />
        ) : (
          <ul className="divide-y divide-border">
            {milestones.items.map((m) => {
              const { day, month } = dateParts(m.dueDate);
              return (
                <li key={m.id} className="flex gap-4 py-3 first:pt-0">
                  <time
                    dateTime={m.dueDate}
                    className="flex w-10 shrink-0 flex-col items-center leading-tight"
                  >
                    <span className="tabular text-lg font-semibold text-ink">
                      {day}
                    </span>
                    <span className="text-[0.6875rem] text-ink-muted">
                      {month}
                    </span>
                  </time>
                  <div className="min-w-0 text-sm">
                    <p className="text-ink">{m.title}</p>
                    <p className="text-xs text-ink-muted">
                      {m.initiative.title}
                      {m.isCritical && ' · critical'}
                      {m.slipDays > 0 && (
                        <span className="text-danger">
                          {' '}
                          · slipped {plural(m.slipDays, 'day')}
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {milestones.total > milestones.items.length && (
          <p className="mt-2 text-xs text-ink-muted">
            and {milestones.total - milestones.items.length} more
          </p>
        )}
      </CardBody>
    </Card>
  );
}
