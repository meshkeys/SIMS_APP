import type { Performance } from '@sims/contracts';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { currencySymbol, formatMoney } from '@/lib/format';
import { benefitInsight, niceTicks } from './benefit-insight';

const WIDTH = 600;
const HEIGHT = 240;
const PAD = { top: 16, right: 12, bottom: 30, left: 48 };
const MILLION = 1_000_000;

/**
 * Expected (grey) against realised (ochre) financial benefits per quarter,
 * with the re-forecast as a dashed outline for quarters still running.
 * Screen readers get a summary and the same figures as a table.
 */
export function BenefitsChart({
  benefits,
  year,
  currency,
}: {
  benefits: Performance['benefits'];
  year: number;
  currency: string;
}) {
  const { quarters } = benefits;
  const symbol = currencySymbol(currency);
  const insight = benefitInsight(quarters);

  return (
    <Card aria-labelledby="benefits-chart-title">
      <CardHeader
        titleId="benefits-chart-title"
        title="Expected vs realised benefits"
        description={`Financial benefits across all initiatives, ${symbol} millions`}
        action={<Legend />}
      />
      <CardBody>
        {benefits.expected === 0 && benefits.realisedToDate === 0 ? (
          <EmptyState
            className="py-8"
            title={`No financial benefits expected in FY${year}`}
            description="Benefits appear here once approved business cases expect value in the year."
          />
        ) : (
          <figure className="m-0">
            <Bars quarters={quarters} year={year} summary={insight} />
            {insight && (
              <figcaption className="mt-3 text-sm text-ink-muted">
                {insight}
              </figcaption>
            )}
            <table className="sr-only">
              <caption>
                Expected and realised benefits by quarter, FY{year}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Quarter</th>
                  <th scope="col">Expected</th>
                  <th scope="col">Realised</th>
                  <th scope="col">Forecast</th>
                </tr>
              </thead>
              <tbody>
                {quarters.map((q) => (
                  <tr key={q.label}>
                    <th scope="row">{q.label}</th>
                    <td>{formatMoney(q.expected, currency)}</td>
                    <td>{formatMoney(q.realised, currency)}</td>
                    <td>{formatMoney(q.forecast, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </figure>
        )}
      </CardBody>
    </Card>
  );
}

function Bars({
  quarters,
  year,
  summary,
}: {
  quarters: Performance['benefits']['quarters'];
  year: number;
  summary: string | null;
}) {
  const inMillions = (n: number) => n / MILLION;
  const max = Math.max(
    ...quarters.flatMap((q) => [q.expected, q.realised ?? 0, q.forecast ?? 0]),
  );
  const ticks = niceTicks(inMillions(max));
  const top = ticks.at(-1)!;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const y = (millions: number) => PAD.top + (1 - millions / top) * plotHeight;
  const slot = (WIDTH - PAD.left - PAD.right) / quarters.length;
  const bar = Math.min(44, slot / 3);
  const label = (n: number) =>
    new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(n);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-auto w-full"
      // Inline SVG drawing: role="img" is the correct way to name it.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="img"
      aria-label={`Expected versus realised benefits by quarter, FY${year}.${summary ? ` ${summary}` : ''} Figures follow in a table.`}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={y(tick)}
            y2={y(tick)}
            className="stroke-border"
          />
          <text
            x={PAD.left - 8}
            y={y(tick) + 4}
            textAnchor="end"
            className="fill-ink-subtle text-[11px]"
          >
            {label(tick)}
          </text>
        </g>
      ))}
      {quarters.map((q, index) => {
        const centre = PAD.left + slot * index + slot / 2;
        const expected = inMillions(q.expected);
        const second = q.realised ?? q.forecast;
        const value = second === null ? null : inMillions(second);
        const isForecast = q.realised === null && q.forecast !== null;
        return (
          <g key={q.label}>
            <rect
              x={centre - bar - 2}
              y={y(expected)}
              width={bar}
              height={Math.max(0, y(0) - y(expected))}
              className="fill-border-strong"
            />
            {value !== null && (
              <>
                <rect
                  x={centre + 2}
                  y={y(value)}
                  width={bar}
                  height={Math.max(0, y(0) - y(value))}
                  className={
                    isForecast
                      ? 'fill-transparent stroke-impact'
                      : 'fill-impact'
                  }
                  strokeWidth={isForecast ? 2 : undefined}
                  strokeDasharray={isForecast ? '5 4' : undefined}
                />
                <text
                  x={centre + 2 + bar / 2}
                  y={y(value) - 6}
                  textAnchor="middle"
                  className="fill-ink text-[11px]"
                >
                  {label(value)}
                </text>
              </>
            )}
            <text
              x={centre}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-ink-muted text-[12px]"
            >
              {q.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Legend() {
  return (
    <div
      className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted"
      aria-hidden="true"
    >
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 bg-border-strong" />
        Expected
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 bg-impact" />
        Realised
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 border-2 border-dashed border-impact" />
        Forecast
      </span>
    </div>
  );
}
