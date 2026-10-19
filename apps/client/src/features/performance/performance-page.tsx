import type { Performance } from '@sims/contracts';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useApiQuery } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { BenefitsChart } from './benefits-chart';
import { KpiScorecard } from './kpi-scorecard';
import { LowValuePanel } from './low-value-panel';

const route = getRouteApi('/app/performance');

const HEADER = {
  eyebrow: 'Performance · Strategic impact lens',
  title: 'KPIs & benefits realisation',
  description:
    'Completion is not success. This view tracks whether delivered work is creating the value it promised.',
};

/** The strategic impact lens: benefits, KPI trajectories and low-value work. */
export function PerformancePage() {
  const { year } = route.useSearch();
  const performance = useApiQuery(
    'getPerformance',
    { query: { year } },
    // Keep showing the previous year while switching.
    { placeholderData: (previous) => previous },
  );

  if (performance.isPending) return <PerformanceSkeleton />;
  if (performance.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader {...HEADER} />
        <Card>
          <ErrorState
            error={performance.error}
            onRetry={() => void performance.refetch()}
            title="KPIs and benefits could not be loaded"
          />
        </Card>
      </div>
    );
  }

  const data = performance.data;
  return (
    <div
      className="flex flex-col gap-6"
      aria-busy={performance.isFetching || undefined}
    >
      <PageHeader
        {...HEADER}
        documentTitle="KPIs & benefits"
        actions={
          <>
            <YearSelect data={data} />
            {data.can.recordKpiActuals && (
              <Button asChild>
                <Link to="/performance/actuals">Record KPI actuals</Link>
              </Button>
            )}
          </>
        }
      />

      <HeadlineTiles data={data} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <BenefitsChart
          benefits={data.benefits}
          year={data.year}
          currency={data.currency}
        />
        <LowValuePanel lowValue={data.lowValue} />
      </div>

      <KpiScorecard rows={data.scorecard} kpis={data.kpis} year={data.year} />
    </div>
  );
}

/** The year on show, kept in the URL; the current year reads "FY2026 YTD". */
function YearSelect({ data }: { data: Performance }) {
  const navigate = useNavigate();
  const currentYear = Number(data.asAt.slice(0, 4));
  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      Period
      <Select
        value={data.year}
        className="w-auto min-w-36"
        onChange={(event) =>
          void navigate({
            to: '/performance',
            search: { year: Number(event.target.value) },
          })
        }
      >
        {[...data.years].reverse().map((y) => (
          <option key={y} value={y}>
            FY{y}
            {y === currentYear ? ' YTD' : ''}
          </option>
        ))}
      </Select>
    </label>
  );
}

function HeadlineTiles({ data }: { data: Performance }) {
  const { benefits, kpis, lowValue, currency, year } = data;
  const pct = benefits.realisedPctOfExpected;
  return (
    <section aria-label="Headline figures">
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          label={`Expected benefits, FY${year}`}
          value={formatMoney(benefits.expected, currency)}
          note="Approved business cases"
        />
        <Tile
          label="Realised to date"
          value={formatMoney(benefits.realisedToDate, currency)}
          note={
            pct === null
              ? 'No quarter has ended yet'
              : `${pct}% of YTD expectation`
          }
          noteClassName={
            pct !== null && pct < 100 ? 'text-impact-text' : undefined
          }
        />
        <Tile
          label="KPIs on trajectory"
          value={`${kpis.onTrajectory} / ${kpis.total}`}
          note={`${kpis.offTrajectory} off trajectory`}
          noteClassName={kpis.offTrajectory > 0 ? 'text-danger' : undefined}
        />
        <Tile
          label="Delivered, low value"
          value={String(lowValue.count)}
          note={
            lowValue.count > 0 ? 'Benefits review needed' : 'Nothing to review'
          }
          noteClassName={lowValue.count > 0 ? 'text-impact-text' : undefined}
        />
      </ul>
    </section>
  );
}

function Tile({
  label,
  value,
  note,
  noteClassName,
}: {
  label: string;
  value: string;
  note: ReactNode;
  noteClassName?: string;
}) {
  return (
    <li className="rounded-card border border-border bg-surface p-5 shadow-card">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="tabular mt-2 text-3xl font-semibold text-ink">{value}</p>
      <p className={cn('mt-1 text-sm text-ink-muted', noteClassName)}>{note}</p>
    </li>
  );
}

function PerformanceSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <output className="sr-only">Loading KPIs and benefits…</output>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-8 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
