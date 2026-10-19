import type { RegisterItem } from '@sims/contracts';
import { Link } from '@tanstack/react-router';
import { HealthBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Meter } from '@/components/ui/meter';
import { EmptyState } from '@/components/ui/states';
import { formatDate, formatPercent } from '@/lib/format';

/** The initiatives most in need of attention (worst health first). */
export function Watchlist({
  items,
  total,
}: {
  items: RegisterItem[];
  total: number;
}) {
  return (
    <Card aria-labelledby="watchlist-title">
      <CardHeader
        titleId="watchlist-title"
        title="Initiative monitoring"
        action={
          <Link
            to="/initiatives"
            className="text-primary underline underline-offset-4"
          >
            View all {total}
          </Link>
        }
      />
      <CardBody className="pt-3">
        {items.length === 0 ? (
          <EmptyState
            title="No active initiatives"
            description="Initiatives appear here once they are activated."
          />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li
                key={item.id}
                className="grid gap-2 py-3 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto_minmax(8rem,12rem)_3rem] sm:items-center sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{item.title}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {item.owner?.jobTitle ?? item.owner?.name ?? 'No owner'}
                    {item.dueDate && ` · Due ${formatDate(item.dueDate)}`}
                  </p>
                </div>
                <HealthBadge
                  health={item.health}
                  className="justify-self-start"
                />
                <Meter
                  value={item.verifiedProgress}
                  label={`Verified progress, ${item.title}`}
                  marker={{ value: item.plannedProgress, label: 'planned' }}
                />
                <span className="tabular text-right text-sm font-medium text-ink">
                  {formatPercent(item.verifiedProgress)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <p className="mt-3 text-xs text-ink-muted">
            Bar = verified weighted completion · tick = planned completion today
          </p>
        )}
      </CardBody>
    </Card>
  );
}
