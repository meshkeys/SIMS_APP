import { cn } from '@/lib/cn';

const fills = {
  execution: 'bg-primary',
  impact: 'bg-impact',
  success: 'bg-success-dot',
  warning: 'bg-warning-dot',
  danger: 'bg-danger-dot',
} as const;

/**
 * A 0–100 bar (execution, impact, progress). Exposes its value to assistive
 * technology; `marker` draws a tick (e.g. where the plan says we should be).
 */
export function Meter({
  value,
  label,
  tone = 'execution',
  marker,
  className,
}: {
  /** null = nothing to measure yet. */
  value: number | null;
  /** Accessible name, e.g. "Execution, Revenue Diversification". */
  label: string;
  tone?: keyof typeof fills;
  marker?: { value: number; label: string };
  className?: string;
}) {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  if (value === null) {
    // A meter must have a value; with nothing measured, say so in words.
    return (
      <div className={cn('relative h-2 w-full', className)}>
        <div
          aria-hidden="true"
          className="h-full w-full rounded-full border border-dashed border-border-strong"
        />
        <span className="sr-only">{label}: not measured yet</span>
      </div>
    );
  }
  return (
    <div
      // A styled div: the native <meter> cannot be styled consistently across browsers.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)}%${marker ? `, ${marker.label} ${Math.round(marker.value)}%` : ''}`}
      className={cn(
        'relative h-2 w-full rounded-full bg-neutral-soft',
        className,
      )}
    >
      <div
        className={cn('h-full rounded-full', fills[tone])}
        style={{ width: `${clamp(value)}%` }}
      />
      {marker && (
        <div
          aria-hidden="true"
          className="absolute -top-1 h-4 w-0.5 rounded bg-ink"
          style={{ left: `calc(${clamp(marker.value)}% - 1px)` }}
        />
      )}
    </div>
  );
}
