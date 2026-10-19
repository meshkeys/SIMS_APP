import type { MyUpdates } from '@sims/contracts';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useSession } from '@/auth/use-auth';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useApiQuery } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { formatDeadline, formatInstantDate, plural } from '@/lib/format';
import { UpdateForm } from './update-form';

const route = getRouteApi('/app/my-updates');

type Item = MyUpdates['items'][number];

const STATUS_WORDS: Record<Item['status'], string> = {
  NOT_STARTED: 'Not started',
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  CHALLENGED: 'Challenged',
  REVIEWED: 'Verified',
  APPROVED: 'Approved',
};

/** "Monthly progress update": the caller's updates due this cycle. */
export function MyUpdatesPage() {
  const { initiative: selectedId } = route.useSearch();
  const navigate = useNavigate();
  const { organisation } = useSession();
  const timeZone = organisation.timezone;
  const mine = useApiQuery('getMyUpdates', {});

  if (mine.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <output className="sr-only">Loading your updates…</output>
        <Skeleton className="h-8 w-80" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (mine.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Monthly progress update" />
        <Card>
          <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />
        </Card>
      </div>
    );
  }

  const { period, items } = mine.data;
  if (!period) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="My updates" title="Monthly progress update" />
        <Card>
          <EmptyState
            title="No reporting cycle is open"
            description="When the Strategy Office opens the next cycle, the updates you owe appear here."
          />
        </Card>
      </div>
    );
  }

  const toDo = items.filter(
    (i) => !['SUBMITTED', 'REVIEWED', 'APPROVED'].includes(i.status),
  );
  const submitted = items.filter((i) =>
    ['SUBMITTED', 'REVIEWED', 'APPROVED'].includes(i.status),
  );
  // Open the one picked, else the first that needs action, else the first.
  const selected =
    items.find((i) => i.initiativeId === selectedId) ??
    items.find((i) => i.actionNeeded) ??
    items[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`My updates · ${period.name} cycle${
          period.submissionDueAt
            ? ` · due ${formatDeadline(period.submissionDueAt, timeZone)}`
            : ''
        }`}
        title="Monthly progress update"
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            title="You have no updates due this cycle"
            description="Updates are owed by the owners of active initiatives."
          />
        </Card>
      ) : (
        <>
          <nav aria-label="Your updates this cycle">
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {toDo.map((item) => (
                <li key={item.initiativeId}>
                  <button
                    type="button"
                    aria-current={
                      item.initiativeId === selected?.initiativeId
                        ? 'true'
                        : undefined
                    }
                    onClick={() =>
                      void navigate({
                        to: '/my-updates',
                        search: { initiative: item.initiativeId },
                        replace: true,
                      })
                    }
                    className={cn(
                      'block h-full w-full rounded-card border bg-surface p-4 text-left transition-colors',
                      item.initiativeId === selected?.initiativeId
                        ? 'border-primary ring-1 ring-primary'
                        : 'border-border hover:border-border-strong',
                    )}
                  >
                    <span className="block font-mono text-xs text-ink-muted">
                      {item.code} · {STATUS_WORDS[item.status]}
                      {item.savedAt &&
                        item.status === 'DRAFT' &&
                        ` ${formatInstantDate(item.savedAt, timeZone)}`}
                    </span>
                    <span className="mt-1 block font-medium text-ink">
                      {item.title}
                    </span>
                    <span
                      className={cn(
                        'mt-1 block text-xs',
                        item.overdue
                          ? 'font-medium text-danger'
                          : item.actionNeeded
                            ? 'text-impact-text'
                            : 'text-ink-muted',
                      )}
                    >
                      {item.overdue
                        ? 'Overdue'
                        : item.status === 'CHALLENGED'
                          ? 'Needs your changes'
                          : item.dueAt
                            ? `Due ${formatInstantDate(item.dueAt, timeZone)}`
                            : ''}
                    </span>
                  </button>
                </li>
              ))}
              <li>
                <div className="h-full rounded-card border border-border bg-surface-muted p-4 text-sm">
                  <p className="text-ink-muted">Submitted this cycle</p>
                  {submitted.length === 0 ? (
                    <p className="mt-1 text-ink">None yet</p>
                  ) : (
                    <ul className="mt-1 flex flex-col gap-1">
                      {submitted.map((item) => (
                        <li key={item.initiativeId}>
                          <button
                            type="button"
                            className="text-left text-ink underline-offset-4 hover:underline"
                            aria-current={
                              item.initiativeId === selected?.initiativeId
                                ? 'true'
                                : undefined
                            }
                            onClick={() =>
                              void navigate({
                                to: '/my-updates',
                                search: { initiative: item.initiativeId },
                                replace: true,
                              })
                            }
                          >
                            <span className="font-mono text-xs text-ink-muted">
                              {item.code}
                            </span>{' '}
                            {item.title} · {STATUS_WORDS[item.status]}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            </ul>
            <p className="mt-2 text-xs text-ink-muted">
              {plural(toDo.filter((i) => i.actionNeeded).length, 'update')} need
              your attention.
            </p>
          </nav>

          {selected && (
            <SelectedUpdate
              periodId={period.id}
              initiativeId={selected.initiativeId}
            />
          )}
        </>
      )}
    </div>
  );
}

function SelectedUpdate({
  periodId,
  initiativeId,
}: {
  periodId: string;
  initiativeId: string;
}) {
  const form = useApiQuery('getUpdate', { params: { periodId, initiativeId } });
  if (form.isPending) return <Skeleton className="h-96" />;
  if (form.isError) {
    return (
      <Card>
        <ErrorState
          error={form.error}
          onRetry={() => void form.refetch()}
          title="This update could not be loaded"
        />
      </Card>
    );
  }
  return (
    <section
      aria-label={`${form.data.initiative.code} · ${form.data.initiative.title}`}
    >
      <UpdateForm key={initiativeId} form={form.data} />
    </section>
  );
}
