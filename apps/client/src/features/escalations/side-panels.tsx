import { ROLE_LABELS } from '@sims/contracts';
import { Link } from '@tanstack/react-router';
import { useSession } from '@/auth/use-auth';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useApiQuery } from '@/lib/api/query';
import { formatDayMonth, formatInstantDay } from '@/lib/format';

/** Initiatives waiting on other initiatives: blocked first, longest first. */
export function BlockedDependencies() {
  const { organisation } = useSession();
  const dependencies = useApiQuery('listDependencies', { query: {} });
  return (
    <Card aria-labelledby="dependencies-title">
      <CardHeader titleId="dependencies-title" title="Blocked dependencies" />
      <CardBody>
        {dependencies.isPending ? (
          <Skeleton className="h-40" />
        ) : dependencies.isError ? (
          <ErrorState
            error={dependencies.error}
            onRetry={() => void dependencies.refetch()}
          />
        ) : dependencies.data.length === 0 ? (
          <EmptyState
            className="py-6"
            title="Nothing is blocked"
            description="No initiative is waiting on another."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {dependencies.data.map((d) => (
              <li key={d.id} className="rounded-md border border-border p-3">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <InitiativeLink initiative={d.from} />
                  <Badge tone={d.status === 'BLOCKED' ? 'danger' : 'warning'}>
                    {d.status === 'BLOCKED' ? 'waiting on' : 'at risk on'}
                  </Badge>
                  <InitiativeLink initiative={d.to} />
                  {d.isCriticalPath && (
                    <span className="text-xs text-ink-muted">
                      · critical path
                    </span>
                  )}
                </p>
                <p className="mt-1 text-right text-xs text-ink-muted">
                  {d.blockedSince
                    ? `Since ${formatInstantDay(d.blockedSince, organisation.timezone)}`
                    : d.neededBy
                      ? `Needed by ${formatDayMonth(d.neededBy)}`
                      : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function InitiativeLink({
  initiative,
}: {
  initiative: { id: string; code: string; title: string };
}) {
  return (
    <Link
      to="/initiatives/$id"
      params={{ id: initiative.id }}
      search={{ tab: 'dependencies' }}
      className="font-medium text-ink underline-offset-2 hover:underline"
    >
      {initiative.code} {initiative.title}
    </Link>
  );
}

const OUTCOME = {
  APPROVED: { label: 'Approved', className: 'text-success' },
  REJECTED: { label: 'Rejected', className: 'text-danger' },
  DEFERRED: { label: 'Deferred', className: 'text-warning' },
  PENDING: { label: 'Pending', className: 'text-ink-muted' },
} as const;

/** The latest decisions taken, newest first. */
export function DecisionLog() {
  const { organisation } = useSession();
  const log = useApiQuery('listDecisions', {
    query: { view: 'log', pageSize: 5 },
  });
  return (
    <Card aria-labelledby="decision-log-title">
      <CardHeader titleId="decision-log-title" title="Decision log" />
      <CardBody>
        {log.isPending ? (
          <Skeleton className="h-40" />
        ) : log.isError ? (
          <ErrorState error={log.error} onRetry={() => void log.refetch()} />
        ) : log.data.items.length === 0 ? (
          <EmptyState className="py-6" title="No decisions taken yet" />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {log.data.items.map((d) => {
              const outcome = OUTCOME[d.outcome];
              const by = d.decidedBy?.jobTitle ?? ROLE_LABELS[d.requiredFrom];
              return (
                <li key={d.id} className="flex gap-3 py-3 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{d.title}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {[
                        by,
                        d.decidedAt &&
                          formatInstantDay(d.decidedAt, organisation.timezone),
                        d.outcomeNotes,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 text-xs font-semibold ${outcome.className}`}
                  >
                    {outcome.label}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
