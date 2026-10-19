import type { UpdateListItem, UpdateStatus } from '@sims/contracts';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useSession } from '@/auth/use-auth';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { hasAnyRole } from '@/lib/access';
import { useApiQuery } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { formatInstantDate, formatPercent } from '@/lib/format';
import { ReviewPanel } from './review-panel';
import { REVIEW_STAGES, type ReviewStage } from './review-stages';

const route = getRouteApi('/app/reviews');

const STATUS: Record<UpdateStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SUBMITTED: { label: 'To verify', tone: 'info' },
  CHALLENGED: { label: 'Challenged', tone: 'warning' },
  REVIEWED: { label: 'Waiting for sponsor', tone: 'info' },
  APPROVED: { label: 'Approved', tone: 'success' },
};

/**
 * Reviewing this cycle's updates: the Strategy Office verifies or challenges
 * submitted ones; sponsors confirm verified ones for their initiatives.
 */
export function ReviewsPage() {
  const session = useSession();
  const isOffice = hasAnyRole(session, ['STRATEGY_OFFICE', 'SYSTEM_ADMIN']);
  const search = route.useSearch();
  const stage: ReviewStage =
    search.stage ?? (isOffice ? 'to-verify' : 'with-sponsor');
  const navigate = useNavigate();
  const go = (next: { stage?: ReviewStage; initiative?: string }) =>
    void navigate({
      from: '/reviews',
      to: '/reviews',
      search: (prev) => ({ ...prev, ...next }),
      replace: true,
    });

  const period = useApiQuery('getCurrentPeriod', {});
  const updates = useApiQuery(
    'listUpdates',
    { params: { id: period.data?.id ?? '' }, query: {} },
    { enabled: !!period.data },
  );

  const header = (
    <PageHeader
      eyebrow={
        period.data ? `Reporting · ${period.data.name} cycle` : 'Reporting'
      }
      title="Update reviews"
      description={
        isOffice
          ? 'Verify the figures owners claimed, or send them back with a challenge.'
          : 'Confirm the verified status of the initiatives you sponsor.'
      }
    />
  );

  if (period.isPending || (period.data && updates.isPending)) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <output className="sr-only">Loading the review queue…</output>
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (period.isError || updates.isError) {
    const error = period.error ?? updates.error;
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <ErrorState
            error={error}
            onRetry={() =>
              void (period.isError ? period.refetch() : updates.refetch())
            }
          />
        </Card>
      </div>
    );
  }
  if (!period.data) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <EmptyState
            title="No reporting cycle is open"
            description="Reviews start once owners submit their updates."
          />
        </Card>
      </div>
    );
  }

  const all = updates.data ?? [];
  const wanted = REVIEW_STAGES[stage].status;
  const items = wanted
    ? all.filter((u) => u.status === wanted)
    : all.filter((u) => u.status !== 'DRAFT');
  const selected = all.find((u) => u.initiativeId === search.initiative);

  return (
    <div className="flex flex-col gap-6">
      {header}
      <fieldset className="m-0 flex min-w-0 gap-1 overflow-x-auto border-0 border-b border-border p-0">
        <legend className="sr-only">Stage</legend>
        {(Object.keys(REVIEW_STAGES) as ReviewStage[]).map((key) => {
          const status = REVIEW_STAGES[key].status;
          const count = status
            ? all.filter((u) => u.status === status).length
            : all.filter((u) => u.status !== 'DRAFT').length;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={key === stage}
              onClick={() => go({ stage: key, initiative: undefined })}
              className={cn(
                '-mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap',
                key === stage
                  ? 'border-ink font-semibold text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              {key === 'with-sponsor' && !isOffice
                ? 'Waiting for you'
                : REVIEW_STAGES[key].label}{' '}
              · {count}
            </button>
          );
        })}
      </fieldset>

      <Card>
        {items.length === 0 ? (
          <EmptyState
            title="Nothing here"
            description={
              stage === 'to-verify'
                ? 'No updates are waiting for verification.'
                : stage === 'with-sponsor'
                  ? 'No verified updates are waiting for confirmation.'
                  : 'No updates at this stage.'
            }
          />
        ) : (
          <Queue
            items={items}
            selectedId={selected?.initiativeId}
            onOpen={(id) => go({ initiative: id })}
          />
        )}
      </Card>

      {selected && (
        <SelectedReview
          periodId={period.data.id}
          initiativeId={selected.initiativeId}
          title={`${selected.code} · ${selected.title}`}
        />
      )}
    </div>
  );
}

function Queue({
  items,
  selectedId,
  onOpen,
}: {
  items: UpdateListItem[];
  selectedId: string | undefined;
  onOpen: (initiativeId: string) => void;
}) {
  const { organisation } = useSession();
  const th = 'px-3 py-2.5 text-left text-xs font-medium text-ink-muted';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] text-sm">
        <caption className="sr-only">
          Updates in this stage, oldest submission first
        </caption>
        <thead className="bg-surface-muted">
          <tr>
            <th scope="col" className={cn(th, 'pl-5')}>
              Initiative
            </th>
            <th scope="col" className={th}>
              Owner
            </th>
            <th scope="col" className={th}>
              Status
            </th>
            <th scope="col" className={th}>
              Claimed
            </th>
            <th scope="col" className={th}>
              Planned
            </th>
            <th scope="col" className={th}>
              Verified
            </th>
            <th scope="col" className={th}>
              Evidence
            </th>
            <th scope="col" className={th}>
              Submitted
            </th>
            <th scope="col" className={cn(th, 'pr-5')}>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((u) => {
            const behind =
              u.plannedProgress !== null &&
              u.claimedProgress < u.plannedProgress;
            return (
              <tr
                key={u.updateId}
                className={cn(
                  u.initiativeId === selectedId && 'bg-primary-soft',
                )}
              >
                <th
                  scope="row"
                  className="px-3 py-3 pl-5 text-left font-normal"
                >
                  <span className="block font-mono text-xs text-ink-muted">
                    {u.code}
                  </span>
                  <span className="block font-medium text-ink">{u.title}</span>
                </th>
                <td className="px-3 py-3">
                  {u.owner?.jobTitle ?? u.owner?.name ?? '—'}
                </td>
                <td className="px-3 py-3">
                  <Badge tone={STATUS[u.status].tone}>
                    {STATUS[u.status].label}
                  </Badge>
                </td>
                <td
                  className={cn('tabular px-3 py-3', behind && 'text-danger')}
                >
                  {formatPercent(u.claimedProgress)}
                </td>
                <td className="tabular px-3 py-3">
                  {formatPercent(u.plannedProgress)}
                </td>
                <td className="tabular px-3 py-3">
                  {formatPercent(u.verifiedProgress)}
                </td>
                <td className="px-3 py-3 text-xs">
                  {u.evidenceFlags > 0 ? (
                    <span className="font-medium text-danger">
                      {u.evidenceFlags} missing
                    </span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-ink-muted">
                  {u.submittedAt
                    ? formatInstantDate(u.submittedAt, organisation.timezone)
                    : '—'}
                </td>
                <td className="px-3 py-3 pr-5">
                  <Button
                    variant={
                      u.initiativeId === selectedId ? 'primary' : 'secondary'
                    }
                    size="sm"
                    aria-label={`Review ${u.code}`}
                    onClick={() => onOpen(u.initiativeId)}
                  >
                    Review
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SelectedReview({
  periodId,
  initiativeId,
  title,
}: {
  periodId: string;
  initiativeId: string;
  title: string;
}) {
  const form = useApiQuery('getUpdate', { params: { periodId, initiativeId } });
  return (
    <section aria-label={`Review of ${title}`} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {form.isPending ? (
        <Skeleton className="h-96" />
      ) : form.isError ? (
        <Card>
          <ErrorState error={form.error} onRetry={() => void form.refetch()} />
        </Card>
      ) : (
        <ReviewPanel key={initiativeId} form={form.data} />
      )}
    </section>
  );
}
