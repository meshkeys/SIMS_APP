import type { Performance } from '@sims/contracts';
import { Link } from '@tanstack/react-router';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { formatPercent } from '@/lib/format';

/**
 * "Delivered, but not creating value": the work that needs a benefits
 * review. Highlighted, because each item needs a decision.
 */
export function LowValuePanel({
  lowValue,
}: {
  lowValue: Performance['lowValue'];
}) {
  const hidden = lowValue.count - lowValue.items.length;
  return (
    <Card aria-labelledby="low-value-title" className="border-2 border-impact">
      <CardHeader
        titleId="low-value-title"
        title="Delivered, but not creating value"
        description={`On plan or complete, impact below ${lowValue.thresholdPct}% of target`}
      />
      <CardBody>
        {lowValue.items.length === 0 ? (
          <EmptyState
            className="py-6"
            title="Nothing to review"
            description="Every delivered initiative with a measured impact is at or above the threshold."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {lowValue.items.map((item) => (
              <li
                key={item.initiativeId}
                className="rounded-md border border-border p-3"
              >
                <p className="font-medium text-ink">
                  <span className="sr-only">{item.code} · </span>
                  {item.title}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-ink-muted">
                  <span>
                    Delivery{' '}
                    <strong className="font-semibold text-ink">
                      {formatPercent(item.delivery)}
                    </strong>
                  </span>
                  <span>
                    Impact{' '}
                    <strong className="font-semibold text-danger">
                      {item.impactSummary ??
                        `${formatPercent(item.impactScore)} of target`}
                    </strong>
                  </span>
                </p>
                <Link
                  to="/initiatives/$id"
                  params={{ id: item.initiativeId }}
                  className="mt-2 inline-block text-sm text-primary underline underline-offset-4"
                  aria-label={`Review the business case of ${item.code}`}
                >
                  Review business case
                </Link>
              </li>
            ))}
          </ul>
        )}
        {hidden > 0 && (
          <p className="mt-3 text-sm text-ink-muted">And {hidden} more.</p>
        )}
      </CardBody>
    </Card>
  );
}
