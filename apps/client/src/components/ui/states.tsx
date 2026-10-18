import { CircleAlert, Inbox } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { errorMessage } from '@/lib/api/errors';
import { cn } from '@/lib/cn';
import { Button } from './button';

/** A grey placeholder shaped like the content that is loading. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-neutral-soft', className)}
      {...props}
    />
  );
}

/** Nothing to show yet — say why, and what to do about it. */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 px-6 py-10 text-center',
        className,
      )}
    >
      <div aria-hidden="true" className="mb-1 text-ink-subtle [&_svg]:size-8">
        {icon ?? <Inbox />}
      </div>
      <p className="font-medium text-ink">{title}</p>
      {description && (
        <p className="max-w-md text-sm text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Loading failed — explain in plain words and offer to try again. */
export function ErrorState({
  error,
  onRetry,
  title = 'This could not be loaded',
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-2 px-6 py-10 text-center',
        className,
      )}
    >
      <CircleAlert aria-hidden="true" className="mb-1 size-8 text-danger" />
      <p className="font-medium text-ink">{title}</p>
      <p className="max-w-md text-sm text-ink-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={onRetry}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
