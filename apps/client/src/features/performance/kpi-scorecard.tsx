import type { Performance, ScorecardRow } from '@sims/contracts';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { formatKpiValue } from '@/lib/format';
import { TRAJECTORY_DISPLAY } from '@/lib/health';

/** Every strategic KPI: where it started, where it must get to, and how it is moving. */
export function KpiScorecard({
  rows,
  kpis,
  year,
}: {
  rows: ScorecardRow[];
  kpis: Performance['kpis'];
  year: number;
}) {
  const th = 'px-3 py-2.5 text-left text-xs font-medium text-ink-muted';
  const targetHeading =
    rows.find((r) => r.targetLabel)?.targetLabel ?? `FY${year}`;
  const trendLength = Math.max(0, ...rows.map((r) => r.trend.length));
  return (
    <Card aria-labelledby="scorecard-title">
      <CardHeader
        titleId="scorecard-title"
        title="Strategic KPI scorecard"
        action={
          <span className="text-ink-muted">
            {kpis.onTrajectory} of {kpis.total} KPIs on or above trajectory
          </span>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          className="py-8"
          title="No KPIs yet"
          description="KPIs are added to pillars and objectives on the strategy map."
        />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <caption className="sr-only">
              Strategic KPIs with baseline, {targetHeading} target, latest
              verified reading, trend and trajectory
            </caption>
            <thead className="bg-surface-muted">
              <tr>
                <th scope="col" className={cn(th, 'pl-5')}>
                  KPI
                </th>
                <th scope="col" className={th}>
                  Pillar
                </th>
                <th scope="col" className={th}>
                  Baseline
                </th>
                <th scope="col" className={th}>
                  {targetHeading} target
                </th>
                <th scope="col" className={th}>
                  Latest actual
                </th>
                <th scope="col" className={th}>
                  {trendLength > 1 ? `${trendLength}-month trend` : 'Trend'}
                </th>
                <th scope="col" className={cn(th, 'pr-5')}>
                  Trajectory
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const trajectory = TRAJECTORY_DISPLAY[row.trajectory];
                return (
                  <tr key={row.id}>
                    <th
                      scope="row"
                      className="px-3 py-3 pl-5 text-left font-medium text-ink"
                    >
                      <span className="sr-only">{row.code} · </span>
                      {row.name}
                    </th>
                    <td className="px-3 py-3 text-ink-muted">
                      {row.topLevel.title}
                    </td>
                    <td className="tabular px-3 py-3">
                      {formatKpiValue(row.baseline, row.unit)}
                    </td>
                    <td className="tabular px-3 py-3">
                      {formatKpiValue(row.target, row.unit)}
                    </td>
                    <td className="tabular px-3 py-3 font-semibold text-ink">
                      {formatKpiValue(row.latestValue, row.unit)}
                    </td>
                    <td className="px-3 py-3">
                      <Sparkline row={row} />
                    </td>
                    <td className="px-3 py-3 pr-5">
                      <Badge tone={trajectory.tone}>{trajectory.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** A small line of the last readings; the words are for screen readers. */
function Sparkline({ row }: { row: ScorecardRow }) {
  const points = row.trend;
  if (points.length < 2) {
    return <span className="text-xs text-ink-subtle">Not enough readings</span>;
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const width = 96;
  const height = 24;
  const line = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`,
    )
    .join(' ');
  const first = points[0]!;
  const last = points.at(-1)!;
  return (
    <>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
      >
        <polyline
          points={line}
          fill="none"
          className="stroke-primary"
          strokeWidth="1.5"
        />
      </svg>
      <span className="sr-only">
        From {formatKpiValue(first.value, row.unit)} in {first.period} to{' '}
        {formatKpiValue(last.value, row.unit)} in {last.period}
      </span>
    </>
  );
}
