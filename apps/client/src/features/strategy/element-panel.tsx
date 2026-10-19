import type { ElementDetail, KpiSummary } from '@sims/contracts';
import { Link } from '@tanstack/react-router';
import { HealthBadge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { Meter } from '@/components/ui/meter';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useApiQuery } from '@/lib/api/query';
import { formatKpiValue, formatPercent, plural } from '@/lib/format';

/** The selected element: its KPIs and the initiatives delivering it. */
export function ElementPanel({ elementId }: { elementId: string }) {
  const element = useApiQuery('getElement', { params: { id: elementId } });

  return (
    <Card
      aria-labelledby="element-title"
      aria-busy={element.isPending || undefined}
    >
      {element.isPending ? (
        <CardBody className="flex flex-col gap-3">
          <output className="sr-only">Loading…</output>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-7 w-80 max-w-full" />
          <Skeleton className="h-40" />
        </CardBody>
      ) : element.isError ? (
        <ErrorState
          error={element.error}
          onRetry={() => void element.refetch()}
          title={
            element.error.status === 404
              ? 'This element no longer exists'
              : 'This element could not be loaded'
          }
        />
      ) : (
        <Detail element={element.data} />
      )}
    </Card>
  );
}

function Detail({ element }: { element: ElementDetail }) {
  const parents = element.breadcrumb.map((b) => b.title).join(' › ');
  return (
    <CardBody>
      <p className="font-mono text-xs text-ink-muted">
        {element.code}
        {parents && ` · ${parents}`}
      </p>
      <h2 id="element-title" className="mt-1 text-xl font-semibold text-ink">
        {element.title}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {element.level.label} owner:{' '}
        {element.owner?.jobTitle ?? element.owner?.name ?? 'Not assigned'}
      </p>
      {element.description && (
        <p className="mt-3 max-w-3xl text-sm text-ink">{element.description}</p>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="kpis-title">
          <h3 id="kpis-title" className="font-semibold text-ink">
            {element.level.label} KPIs
          </h3>
          {element.kpis.length === 0 ? (
            <EmptyState
              className="py-6"
              title="No KPIs yet"
              description="KPIs measure whether this is creating the intended value."
            />
          ) : (
            <KpiTable kpis={element.kpis} />
          )}
        </section>

        <section aria-labelledby="contributors-title">
          <h3 id="contributors-title" className="font-semibold text-ink">
            Contributing initiatives
          </h3>
          {element.contributors.length === 0 ? (
            <EmptyState
              className="py-6"
              title="No initiatives contribute yet"
              description="Link an initiative to this element when proposing or editing it."
            />
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {element.contributors.map((c) => (
                <li
                  key={c.initiativeId}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <Link
                      to="/initiatives"
                      className="block truncate text-sm font-medium text-ink hover:underline"
                    >
                      {c.title}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      {c.isPrimary ? 'Primary contributor' : 'Contributor'} ·{' '}
                      {formatPercent(c.contributionWeight)}
                    </p>
                  </div>
                  <HealthBadge health={c.health} />
                </li>
              ))}
            </ul>
          )}
          {element.hiddenContributors > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              {plural(element.hiddenContributors, 'restricted initiative')} not
              shown.
            </p>
          )}
          <p className="mt-3 text-xs text-ink-muted">
            An initiative can contribute to several objectives. Contribution
            weights are set when the initiative is approved.
          </p>
        </section>
      </div>

      {element.children.length > 0 && (
        <section aria-labelledby="children-title" className="mt-8">
          <h3 id="children-title" className="font-semibold text-ink">
            Below this
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {element.children.map((child) => (
              <li key={child.id}>
                <Link
                  to="/strategy"
                  search={{ element: child.id }}
                  resetScroll={false}
                  className="inline-flex gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:border-border-strong"
                >
                  <span className="font-mono text-xs text-ink-muted">
                    {child.code}
                  </span>
                  {child.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </CardBody>
  );
}

function KpiTable({ kpis }: { kpis: KpiSummary[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface-muted text-left text-xs text-ink-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              KPI
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Baseline
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Target
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Actual
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              To target
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {kpis.map((kpi) => {
            const target = kpi.currentTarget;
            return (
              <tr key={kpi.id}>
                <th
                  scope="row"
                  className="px-3 py-2.5 text-left font-normal text-ink"
                >
                  {kpi.name}
                </th>
                <td className="tabular px-3 py-2.5">
                  {formatKpiValue(kpi.baseline, kpi.unit)}
                </td>
                <td className="tabular px-3 py-2.5">
                  {formatKpiValue(target?.value ?? kpi.planTarget, kpi.unit)}
                  {target && (
                    <span className="block text-xs text-ink-muted">
                      {target.label}
                    </span>
                  )}
                </td>
                <td className="tabular px-3 py-2.5 font-semibold">
                  {formatKpiValue(kpi.latestValue, kpi.unit)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex min-w-28 items-center gap-2">
                    <Meter
                      value={
                        kpi.progressToTarget === null
                          ? null
                          : Math.max(0, kpi.progressToTarget)
                      }
                      tone="impact"
                      label={`Progress to target, ${kpi.name}`}
                      className="flex-1"
                    />
                    <span className="tabular w-10 text-right text-xs">
                      {formatPercent(kpi.progressToTarget)}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
