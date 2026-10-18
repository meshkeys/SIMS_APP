import type { Dashboard, ValueQuadrant } from '@sims/contracts';
import { Link } from '@tanstack/react-router';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';

const CELLS: {
  quadrant: Exclude<ValueQuadrant, 'NOT_MEASURABLE'>;
  title: string;
  advice: string;
  className: string;
}[] = [
  {
    quadrant: 'BEHIND_VALUE_OK',
    title: 'Behind plan · value on track',
    advice: 'Protect momentum, unblock delivery',
    className: 'bg-surface-muted',
  },
  {
    quadrant: 'ON_PLAN_VALUE_OK',
    title: 'On plan · value on track',
    advice: 'Delivering strategy as intended',
    className: 'bg-success-soft',
  },
  {
    quadrant: 'BEHIND_VALUE_LOW',
    title: 'Behind plan · value below target',
    advice: 'Intervene or stop',
    className: 'bg-danger-soft',
  },
  {
    quadrant: 'ON_PLAN_VALUE_LOW',
    title: 'On plan · value below target',
    advice: 'Delivered, but not creating value. Review the business case',
    // The quadrant that needs a decision stands out.
    className: 'bg-warning-soft ring-2 ring-impact ring-inset',
  },
];

/** Delivery (x) against value (y): where the portfolio's effort is going. */
export function ValueMatrix({ matrix }: { matrix: Dashboard['matrix'] }) {
  const { quadrants } = matrix;
  const measurable = CELLS.reduce((n, c) => n + quadrants[c.quadrant].count, 0);
  const unmeasured = quadrants.NOT_MEASURABLE.count;

  return (
    <Card aria-labelledby="matrix-title">
      <CardHeader
        titleId="matrix-title"
        title="Delivery vs value matrix"
        description={`${plural(measurable, 'initiative')} with live impact KPIs · ${unmeasured} not yet measurable`}
        action={
          <Link
            to="/performance"
            className="text-primary underline underline-offset-4"
          >
            Open benefits view
          </Link>
        }
      />
      <CardBody>
        <div className="flex gap-3">
          <p
            aria-hidden="true"
            className="hidden items-center text-xs text-ink-subtle [writing-mode:vertical-rl] sm:flex sm:rotate-180"
          >
            Strategic impact →
          </p>
          <div className="flex-1">
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CELLS.map((cell) => {
                const { count, items } = quadrants[cell.quadrant];
                return (
                  <li
                    key={cell.quadrant}
                    className={cn('rounded-md p-4', cell.className)}
                  >
                    <p className="text-sm text-ink-muted">{cell.title}</p>
                    <p className="tabular mt-1 text-2xl font-semibold text-ink">
                      {count}
                    </p>
                    <p className="mt-1 text-sm text-ink">{cell.advice}</p>
                    {items.length > 0 && (
                      <details className="mt-2 text-sm">
                        <summary className="cursor-pointer text-primary">
                          Show {plural(count, 'initiative')}
                        </summary>
                        <ul className="mt-2 flex flex-col gap-1">
                          {items.map((item) => (
                            <li key={item.id} className="flex gap-2">
                              <span className="font-mono text-xs text-ink-muted">
                                {item.code}
                              </span>
                              <span className="truncate">{item.title}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
            <p
              aria-hidden="true"
              className="mt-2 text-center text-xs text-ink-subtle"
            >
              Execution performance →
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
