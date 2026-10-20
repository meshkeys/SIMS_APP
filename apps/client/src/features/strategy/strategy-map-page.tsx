import {
  type MapElement,
  STRATEGY_EDITOR_ROLES,
  type StrategyMap,
} from '@sims/contracts';
import { getRouteApi, Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Meter } from '@/components/ui/meter';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { hasAnyRole } from '@/lib/access';
import { useApiQuery } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import {
  formatDate,
  formatInstantDate,
  formatKpiValue,
  formatPercent,
  plural,
} from '@/lib/format';
import { OBJECTIVE_HEALTH_WORDS } from '@/lib/health';
import { AddElementDialog } from './add-element-dialog';
import { ElementPanel } from './element-panel';

const route = getRouteApi('/app/strategy');

const HEALTH_DOT = {
  GREEN: 'bg-success-dot',
  AMBER: 'bg-warning-dot',
  RED: 'bg-danger-dot',
  UNKNOWN: 'bg-neutral-dot',
} as const;

/** "From strategy to execution": the plan as a map, top level to objectives. */
export function StrategyMapPage() {
  const { element: selectedId } = route.useSearch();
  const session = useSession();
  const map = useApiQuery('getCurrentStrategyMap', {});
  const [adding, setAdding] = useState(false);
  const canEdit = hasAnyRole(session, STRATEGY_EDITOR_ROLES);

  if (map.isPending) return <MapSkeleton />;
  if (map.isError) {
    if (map.error.code === 'NO_PLAN') {
      return (
        <div className="flex flex-col gap-6">
          <PageHeader title="Strategy map" />
          <Card>
            <EmptyState
              title="No strategic plan yet"
              description="Once the Strategy Office sets up the plan, its pillars, objectives and KPIs appear here."
            />
          </Card>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Strategy map" />
        <Card>
          <ErrorState error={map.error} onRetry={() => void map.refetch()} />
        </Card>
      </div>
    );
  }

  const { plan, levels } = map.data;
  const top = levels[0];
  const second = levels[1];
  const timeZone = session.organisation.timezone;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <>
            Strategy map · {plan.name} · v{plan.version}
            {plan.approvedAt &&
              ` approved ${formatInstantDate(plan.approvedAt, timeZone)}`}
          </>
        }
        title="From strategy to execution"
        documentTitle="Strategy map"
        description={`${[...levels.map((l) => l.label), 'KPI', 'initiative'].join(' → ')}. Select any ${(second ?? top)?.label.toLowerCase() ?? 'element'} to see what is delivering it.`}
        actions={
          canEdit && (
            <Button onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" />
              Add {(second ?? top)?.label.toLowerCase() ?? 'element'}
            </Button>
          )
        }
      />

      <AspirationBanner map={map.data} />

      <StrategyTree map={map.data} selectedId={selectedId} />

      {selectedId ? (
        <ElementPanel key={selectedId} elementId={selectedId} />
      ) : (
        <Card>
          <EmptyState
            title={`Select any ${(second ?? top)?.label.toLowerCase() ?? 'element'} to see what is delivering it`}
            description="Its KPIs and the initiatives contributing to it will appear here."
          />
        </Card>
      )}

      {adding && (
        <AddElementDialog map={map.data} onClose={() => setAdding(false)} />
      )}

      <p className="text-xs text-ink-subtle">
        Plan period {formatDate(plan.startDate)} – {formatDate(plan.endDate)}.
      </p>
    </div>
  );
}

function AspirationBanner({ map }: { map: StrategyMap }) {
  const statement = map.plan.aspiration ?? map.plan.vision;
  // Without an aspiration the vision is shown, under its own name.
  const heading =
    !map.plan.aspiration && map.plan.vision ? 'Vision' : 'Strategic aspiration';
  const totals = [
    ...map.levels.map((level) => ({
      value: level.elementCount,
      label: level.elementCount === 1 ? level.label : level.pluralLabel,
    })),
    { value: map.totals.kpis, label: map.totals.kpis === 1 ? 'KPI' : 'KPIs' },
    {
      value: map.totals.activeInitiatives,
      label: map.totals.activeInitiatives === 1 ? 'Initiative' : 'Initiatives',
    },
  ];
  return (
    <section
      aria-label={heading}
      className="flex flex-col gap-5 rounded-card bg-sidebar px-6 py-5 text-sidebar-text lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="max-w-2xl">
        <p className="text-[0.6875rem] font-medium tracking-wider text-sidebar-muted uppercase">
          {heading}
        </p>
        <p className="mt-1.5 text-lg leading-snug text-white">
          {statement ?? 'No aspiration recorded yet.'}
        </p>
      </div>
      <dl className="flex flex-wrap gap-6">
        {totals.map((t) => (
          <div key={t.label} className="flex flex-col-reverse">
            <dt className="text-xs text-sidebar-muted">{t.label}</dt>
            <dd className="tabular text-2xl font-semibold text-white">
              {t.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Top-level cards (e.g. pillars), each holding its children (e.g. objectives). */
function StrategyTree({
  map,
  selectedId,
}: {
  map: StrategyMap;
  selectedId: string | undefined;
}) {
  const childrenOf = useMemo(() => {
    const result = new Map<string | null, MapElement[]>();
    for (const element of map.elements) {
      const list = result.get(element.parentId) ?? [];
      list.push(element);
      result.set(element.parentId, list);
    }
    for (const list of result.values())
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    return result;
  }, [map.elements]);

  const roots = childrenOf.get(null) ?? [];
  const topLabel = map.levels[0]?.label ?? 'Pillar';

  if (roots.length === 0) {
    return (
      <Card>
        <EmptyState
          title={`No ${map.levels[0]?.pluralLabel.toLowerCase() ?? 'elements'} yet`}
          description="Add the first one to start building the strategy map."
        />
      </Card>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {roots.map((root, index) => {
        const children = childrenOf.get(root.id) ?? [];
        return (
          <li
            key={root.id}
            className="flex flex-col rounded-card border border-border bg-surface p-4 shadow-card"
          >
            <p className="font-mono text-xs text-ink-muted uppercase">
              {topLabel} {String(index + 1).padStart(2, '0')}
            </p>
            {children.length === 0 ? (
              <ElementLink element={root} className="mt-1">
                <span className="font-semibold">{root.title}</span>
              </ElementLink>
            ) : (
              <h2 className="mt-1 font-semibold text-ink">{root.title}</h2>
            )}
            <p className="mt-0.5 text-xs text-ink-muted">
              Sponsor:{' '}
              {root.sponsor?.jobTitle ?? root.sponsor?.name ?? 'Not assigned'}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Meter
                value={root.executionScore}
                label={`Execution, ${root.title}`}
                className="flex-1"
              />
              <span className="tabular w-10 text-right text-sm font-medium">
                {formatPercent(root.executionScore)}
              </span>
            </div>
            {children.length > 0 && (
              <ul className="mt-4 flex flex-col gap-3">
                {children.map((child) => (
                  <li key={child.id}>
                    <ChildCard
                      element={child}
                      selected={child.id === selectedId}
                      grandchildren={childrenOf.get(child.id)?.length ?? 0}
                      nextLabel={
                        map.levels[
                          map.levels.findIndex((l) => l.id === child.levelId) +
                            1
                        ]?.pluralLabel
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ChildCard({
  element,
  selected,
  grandchildren,
  nextLabel,
}: {
  element: MapElement;
  selected: boolean;
  grandchildren: number;
  nextLabel: string | undefined;
}) {
  const kpi = element.headlineKpi;
  return (
    <ElementLink
      element={element}
      className={cn(
        'block rounded-md border p-3 transition-colors',
        selected
          ? 'border-primary bg-primary-soft ring-1 ring-primary'
          : 'border-border hover:border-border-strong',
      )}
    >
      <span className="block font-mono text-xs text-ink-muted">
        {element.code}
      </span>
      <span className="mt-1 block text-sm font-medium text-ink">
        {element.title}
      </span>
      {kpi && (
        <span className="mt-1 block text-xs text-ink-muted">
          {kpi.name}: {formatKpiValue(kpi.baseline, kpi.unit)} →{' '}
          {formatKpiValue(kpi.target, kpi.unit)}
        </span>
      )}
      <span className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
        <span
          aria-hidden="true"
          className={cn('size-1.5 rounded-full', HEALTH_DOT[element.health])}
        />
        {plural(element.initiatives.total, 'initiative')} ·{' '}
        {OBJECTIVE_HEALTH_WORDS[element.health]}
        {grandchildren > 0 &&
          nextLabel &&
          ` · ${grandchildren} ${nextLabel.toLowerCase()}`}
      </span>
    </ElementLink>
  );
}

/**
 * Selecting an element is a link: it can be opened in a new tab or shared.
 * The router marks the selected one with aria-current (its URL is the page's).
 */
function ElementLink({
  element,
  className,
  children,
}: {
  element: MapElement;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to="/strategy"
      search={{ element: element.id }}
      resetScroll={false}
      className={className}
    >
      {children}
    </Link>
  );
}

function MapSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <output className="sr-only">Loading the strategy map…</output>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-8 w-96 max-w-full" />
      </div>
      <Skeleton className="h-24" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
    </div>
  );
}
