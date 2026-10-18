import { cn } from '@/lib/cn';

const sizes = {
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-10 border-[3px]',
};

/**
 * A loading indicator. `label` is read by screen readers ("Loading…" by
 * default); pass null when the surrounding element already says it is busy.
 */
export function Spinner({
  size = 'md',
  label = 'Loading…',
  className,
}: {
  size?: keyof typeof sizes;
  label?: string | null;
  className?: string;
}) {
  return (
    <span
      role={label ? 'status' : undefined}
      className={cn('inline-flex items-center', className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'animate-spin rounded-full border-current border-r-transparent opacity-80',
          sizes[size],
        )}
      />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
