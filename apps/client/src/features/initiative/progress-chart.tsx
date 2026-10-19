import type { InitiativeDetail } from '@sims/contracts';
import { EmptyState } from '@/components/ui/states';
import { formatDate, formatDayMonth, formatPercent } from '@/lib/format';

type History = InitiativeDetail['progressHistory'];

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 12, right: 16, bottom: 28, left: 40 };

/**
 * Baseline plan (dashed) against verified progress (solid), one point per
 * locked reporting period. Drawn as SVG; screen readers get a summary and the
 * same figures as a table.
 */
export function ProgressChart({ history }: { history: History }) {
  if (history.length < 2) {
    return (
      <EmptyState
        className="py-6"
        title="Not enough history yet"
        description="A point is added each time a reporting period is locked."
      />
    );
  }

  const times = history.map((h) => Date.parse(`${h.asOf}T00:00:00Z`));
  const first = times[0]!;
  const last = times.at(-1)!;
  const x = (t: number) =>
    PAD.left +
    ((t - first) / Math.max(1, last - first)) * (WIDTH - PAD.left - PAD.right);
  const y = (pct: number) =>
    PAD.top +
    (1 - Math.min(100, Math.max(0, pct)) / 100) *
      (HEIGHT - PAD.top - PAD.bottom);
  const line = (key: 'planned' | 'verified') =>
    history.map((h, i) => `${x(times[i]!)},${y(h[key])}`).join(' ');

  const latest = history.at(-1)!;
  const gap = Math.round((latest.verified - latest.planned) * 10) / 10;
  const summary = `On ${formatDate(latest.asOf)}, verified progress was ${formatPercent(latest.verified)} against ${formatPercent(latest.planned)} planned (${gap >= 0 ? '+' : ''}${gap} pp).`;
  // Up to five evenly spaced date labels.
  const ticks = history.filter(
    (_, i) =>
      i % Math.ceil(history.length / 5) === 0 || i === history.length - 1,
  );

  return (
    <figure className="m-0">
      <div
        className="mb-2 flex justify-end gap-4 text-xs text-ink-muted"
        aria-hidden="true"
      >
        <span className="flex items-center gap-1.5">
          <svg width="18" height="2">
            <line
              x1="0"
              y1="1"
              x2="18"
              y2="1"
              className="stroke-ink-subtle"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          </svg>
          Baseline plan
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-primary" />
          Verified actual
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        // Inline SVG drawing: role="img" is the correct way to name it.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="img"
        aria-label={`Planned versus verified progress. ${summary}`}
      >
        {[0, 25, 50, 75, 100].map((pct) => (
          <g key={pct}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(pct)}
              y2={y(pct)}
              className="stroke-border"
            />
            <text
              x={PAD.left - 6}
              y={y(pct) + 4}
              textAnchor="end"
              className="fill-ink-subtle text-[10px]"
            >
              {pct}%
            </text>
          </g>
        ))}
        {ticks.map((h) => {
          const t = Date.parse(`${h.asOf}T00:00:00Z`);
          return (
            <text
              key={h.asOf}
              x={x(t)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-ink-subtle text-[10px]"
            >
              {formatDayMonth(h.asOf)}
            </text>
          );
        })}
        <polyline
          points={line('planned')}
          fill="none"
          className="stroke-ink-subtle"
          strokeWidth="2"
          strokeDasharray="5 4"
        />
        <polyline
          points={line('verified')}
          fill="none"
          className="stroke-primary"
          strokeWidth="2.5"
        />
        <circle
          cx={x(last)}
          cy={y(latest.verified)}
          r="4"
          className="fill-primary"
        />
        {gap < 0 && (
          <text
            x={x(last) - 6}
            y={y(latest.verified) + 16}
            textAnchor="end"
            className="fill-impact-text text-[11px] font-medium"
          >
            {gap} pp
          </text>
        )}
      </svg>
      <figcaption className="mt-2 text-xs text-ink-muted">{summary}</figcaption>
      <table className="sr-only">
        <caption>Planned and verified progress by period</caption>
        <thead>
          <tr>
            <th scope="col">As of</th>
            <th scope="col">Planned</th>
            <th scope="col">Verified</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.asOf}>
              <th scope="row">{formatDate(h.asOf)}</th>
              <td>{formatPercent(h.planned)}</td>
              <td>{formatPercent(h.verified)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
