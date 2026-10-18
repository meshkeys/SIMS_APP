import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** The white panel every dashboard section sits in. */
export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'rounded-card border border-border bg-surface shadow-card',
        className,
      )}
      {...props}
    />
  );
}

/** Title row of a card, with an optional action (e.g. "View all 32"). */
export function CardHeader({
  title,
  description,
  action,
  titleId,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Pass to the Card's aria-labelledby so the section is named. */
  titleId?: string;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex items-start justify-between gap-4 px-5 pt-5',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 id={titleId} className="text-base font-semibold text-ink">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-ink-muted">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0 text-sm">{action}</div>}
    </header>
  );
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-5', className)} {...props} />;
}
