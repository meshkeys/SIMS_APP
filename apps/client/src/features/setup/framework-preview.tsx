import type { OnboardingState } from '@sims/contracts';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/cn';

/** Example titles for each strategy level, top first. */
const EXAMPLES = [
  'Revenue Diversification',
  'Grow non-interest income share',
  'Expand SME lending',
  'Regional branch network',
];

/**
 * How one thread of the strategy reads with these names: vision, each
 * strategy level, then a KPI, an initiative and a milestone.
 */
export function FrameworkPreview({
  levels,
  terms,
  vision,
}: {
  levels: { key: string; label: string }[];
  terms: OnboardingState['organisation']['terminology'];
  vision: string | null;
}) {
  const rows = [
    ...levels.map((level, i) => ({
      key: level.key,
      label: level.label || `Level ${i + 1}`,
      text: EXAMPLES[i] ?? `Example ${level.label || 'item'}`,
      bar: 'border-primary',
    })),
    {
      key: 'kpi',
      label: terms.kpi,
      text: 'Non-interest income: 18% → 30%',
      bar: 'border-warning-dot',
    },
    {
      key: 'initiative',
      label: terms.initiative,
      text: 'Expand Institutional Partnerships',
      bar: 'border-success-dot',
    },
    {
      key: 'milestone',
      label: terms.milestone,
      text: 'Partner agreement signed',
      bar: 'border-neutral-dot',
    },
  ];
  return (
    <Card aria-labelledby="preview-title" className="bg-surface-muted">
      <CardHeader
        titleId="preview-title"
        title="Live preview"
        description="How one thread of your strategy will look"
      />
      <CardBody>
        <ol className="flex flex-col gap-2">
          <li className="rounded-md border-l-4 border-ink bg-surface px-4 py-2">
            <span className="block text-xs tracking-wide text-ink-muted uppercase">
              Vision
            </span>
            <span className="text-sm font-medium text-ink">
              {vision ?? '[Your vision statement]'}
            </span>
          </li>
          {rows.map((row, depth) => (
            <li
              key={row.key}
              className={cn(
                'rounded-md border-l-4 bg-surface px-4 py-2',
                row.bar,
              )}
              style={{ marginLeft: `${Math.min(depth + 1, 6) * 0.75}rem` }}
            >
              <span className="block text-xs tracking-wide text-ink-muted uppercase">
                {row.label}
              </span>
              <span className="text-sm font-medium text-ink">{row.text}</span>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}
