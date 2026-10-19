import type { RiskView } from '@sims/contracts';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useApiQuery } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { SEVERITY_DISPLAY } from '@/lib/health';

export interface Cell {
  likelihood: number;
  impact: number;
}

/** Colour by likelihood × impact, on the same bands as risk severity. */
const band = (score: number) =>
  score >= 15
    ? { label: 'Critical', className: 'bg-danger-soft' }
    : score >= 10
      ? { label: 'High', className: 'bg-impact/30' }
      : score >= 5
        ? { label: 'Medium', className: 'bg-warning-soft' }
        : { label: 'Low', className: 'bg-success-soft' };

const LEGEND = [
  { label: 'Low', className: 'bg-success-soft' },
  { label: 'Medium', className: 'bg-warning-soft' },
  { label: 'High', className: 'bg-impact/30' },
  { label: 'Critical', className: 'bg-danger-soft' },
];

/**
 * Open risks on the 5×5 grid (impact up, likelihood across). Selecting a
 * cell lists its risks underneath, each of which can be escalated.
 */
export function RiskHeatmap({
  cell,
  onSelect,
  onEscalate,
  canEscalate,
}: {
  cell: Cell | undefined;
  onSelect: (cell: Cell | undefined) => void;
  onEscalate: (risk: RiskView) => void;
  canEscalate: boolean;
}) {
  const register = useApiQuery('listRisks', { query: { type: 'RISK' } });
  const total = register.data?.heatmap.flat().reduce((a, b) => a + b, 0);

  return (
    <Card aria-labelledby="heatmap-title">
      <CardHeader
        titleId="heatmap-title"
        title="Portfolio risk heatmap"
        description={
          total === undefined
            ? 'Open risks'
            : `${plural(total, 'open risk')} · select a cell to filter`
        }
      />
      <CardBody>
        {register.isPending ? (
          <Skeleton className="aspect-square max-h-80" />
        ) : register.isError ? (
          <ErrorState
            error={register.error}
            onRetry={() => void register.refetch()}
          />
        ) : (
          <>
            <div className="flex gap-2">
              <p
                aria-hidden="true"
                className="flex items-center text-xs text-ink-subtle [writing-mode:vertical-rl] rotate-180"
              >
                Impact →
              </p>
              <div className="flex-1">
                <table className="w-full table-fixed border-separate border-spacing-1">
                  <caption className="sr-only">
                    Open risks by impact (rows, 5 at the top) and likelihood
                    (columns, 1 to 5)
                  </caption>
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">Impact</th>
                      {[1, 2, 3, 4, 5].map((l) => (
                        <th key={l} scope="col">
                          Likelihood {l}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {register.data.heatmap.map((row, r) => {
                      const impact = 5 - r;
                      return (
                        <tr key={impact}>
                          <th scope="row" className="sr-only">
                            Impact {impact}
                          </th>
                          {row.map((count, c) => {
                            const likelihood = c + 1;
                            const { label, className } = band(
                              likelihood * impact,
                            );
                            const pressed =
                              cell?.likelihood === likelihood &&
                              cell.impact === impact;
                            return (
                              <td key={likelihood} className="p-0">
                                <button
                                  type="button"
                                  aria-pressed={pressed}
                                  aria-label={`Likelihood ${likelihood}, impact ${impact} (${label.toLowerCase()}): ${plural(count, 'risk')}`}
                                  disabled={count === 0 && !pressed}
                                  onClick={() =>
                                    onSelect(
                                      pressed
                                        ? undefined
                                        : { likelihood, impact },
                                    )
                                  }
                                  className={cn(
                                    'tabular flex aspect-[5/4] w-full items-center justify-center rounded text-sm font-medium text-ink disabled:cursor-default',
                                    className,
                                    pressed && 'ring-2 ring-primary',
                                  )}
                                >
                                  {count > 0 ? count : ''}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p
                  aria-hidden="true"
                  className="mt-1 text-center text-xs text-ink-subtle"
                >
                  Likelihood →
                </p>
              </div>
            </div>
            <ul
              aria-label="Colour key"
              className="mt-3 flex flex-wrap gap-4 text-xs text-ink-muted"
            >
              {LEGEND.map((item) => (
                <li key={item.label} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={cn('size-3 rounded-sm', item.className)}
                  />
                  {item.label}
                </li>
              ))}
            </ul>
            {cell && (
              <CellRisks
                cell={cell}
                onEscalate={onEscalate}
                canEscalate={canEscalate}
              />
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function CellRisks({
  cell,
  onEscalate,
  canEscalate,
}: {
  cell: Cell;
  onEscalate: (risk: RiskView) => void;
  canEscalate: boolean;
}) {
  const risks = useApiQuery('listRisks', {
    query: { type: 'RISK', likelihood: cell.likelihood, impact: cell.impact },
  });
  return (
    <section
      aria-label={`Risks at likelihood ${cell.likelihood}, impact ${cell.impact}`}
      className="mt-4 border-t border-border pt-4"
    >
      <h3 className="text-sm font-semibold text-ink">
        Likelihood {cell.likelihood} × impact {cell.impact}
      </h3>
      {risks.isPending ? (
        <Skeleton className="mt-2 h-16" />
      ) : risks.isError ? (
        <ErrorState error={risks.error} onRetry={() => void risks.refetch()} />
      ) : risks.data.items.length === 0 ? (
        <EmptyState className="py-4" title="No open risks here" />
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {risks.data.items.map((risk) => (
            <li
              key={risk.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{risk.title}</p>
                <p className="text-xs text-ink-muted">
                  {risk.initiative ? (
                    <Link
                      to="/initiatives/$id"
                      params={{ id: risk.initiative.id }}
                      search={{ tab: 'risks' }}
                      className="underline underline-offset-2"
                    >
                      {risk.initiative.code}
                    </Link>
                  ) : (
                    'Portfolio'
                  )}{' '}
                  · {risk.owner?.jobTitle ?? risk.owner?.name ?? 'No owner'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={SEVERITY_DISPLAY[risk.severity].tone}>
                  {SEVERITY_DISPLAY[risk.severity].label}
                </Badge>
                {risk.escalation ? (
                  <Badge tone="info">
                    {risk.escalation.reference} · L{risk.escalation.level}
                  </Badge>
                ) : (
                  canEscalate && (
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Escalate ${risk.title}`}
                      onClick={() => onEscalate(risk)}
                    >
                      Escalate
                    </Button>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
