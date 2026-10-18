import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useSession } from '@/auth/use-auth';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useApiQuery } from '@/lib/api/query';
import { formatInstantDay } from '@/lib/format';
import { CycleTracker } from './cycle-tracker';
import { DecisionsPanel } from './decisions-panel';
import { HeadlineTiles } from './headline-tiles';
import { PillarPerformance } from './pillar-performance';
import { EscalationsPanel, MilestonesPanel } from './side-panels';
import { ValueMatrix } from './value-matrix';
import { Watchlist } from './watchlist';

const route = getRouteApi('/app/');

/** The Strategy Execution Command Centre. */
export function DashboardPage() {
  const { elementId } = route.useSearch();
  const session = useSession();
  const timeZone = session.organisation.timezone;
  const dashboard = useApiQuery(
    'getDashboard',
    { query: { elementId } },
    // Keep showing the previous view while switching scope.
    { placeholderData: (previous) => previous },
  );

  if (dashboard.isPending) return <DashboardSkeleton />;
  if (dashboard.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Strategy Execution Command Centre" />
        <Card>
          <ErrorState
            error={dashboard.error}
            onRetry={() => void dashboard.refetch()}
            title="The dashboard could not be loaded"
          />
        </Card>
      </div>
    );
  }

  const data = dashboard.data;
  return (
    <div
      className="flex flex-col gap-6"
      aria-busy={dashboard.isFetching || undefined}
    >
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            {data.plan.name} · Snapshot as at{' '}
            {formatInstantDay(data.asAt, timeZone)}
            {data.scope && (
              <Badge tone="info">
                {data.scope.code} · {data.scope.title}
              </Badge>
            )}
          </span>
        }
        title="Strategy Execution Command Centre"
        documentTitle="Dashboard"
        actions={<ScopeSelect current={elementId} />}
      />

      <CycleTracker cycle={data.cycle} timeZone={timeZone} />
      <HeadlineTiles tiles={data.tiles} pillarCount={data.performance.length} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <PillarPerformance rows={data.performance} scoped={!!data.scope} />
          <ValueMatrix matrix={data.matrix} />
          <Watchlist items={data.watchlist} total={data.tiles.active} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <DecisionsPanel decisions={data.decisions} />
          <EscalationsPanel escalations={data.escalations} />
          <MilestonesPanel milestones={data.milestones} />
        </div>
      </div>
    </div>
  );
}

/** "View: Enterprise / one pillar" — kept in the URL so the view can be shared. */
function ScopeSelect({ current }: { current: string | undefined }) {
  const navigate = useNavigate();
  const map = useApiQuery('getCurrentStrategyMap', {});
  const pillars = map.data?.elements.filter((e) => e.parentId === null) ?? [];
  const label = map.data?.levels[0]?.label ?? 'Pillar';

  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      View
      <Select
        value={current ?? ''}
        disabled={!map.data}
        className="w-auto min-w-48"
        onChange={(event) =>
          void navigate({
            to: '/',
            search: event.target.value ? { elementId: event.target.value } : {},
          })
        }
      >
        <option value="">Enterprise</option>
        {pillars.map((pillar) => (
          <option key={pillar.id} value={pillar.id}>
            {label}: {pillar.title}
          </option>
        ))}
      </Select>
    </label>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <output className="sr-only">Loading the dashboard…</output>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-8 w-96 max-w-full" />
      </div>
      <Skeleton className="h-20" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
