import { type ReactNode, useEffect } from 'react';
import { cn } from '@/lib/cn';

/**
 * The top of every screen: context line, title, description and actions.
 * Also sets the browser tab title, so history and screen readers say where
 * the user is.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  documentTitle,
  className,
}: {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Tab title when it should differ from `title`. */
  documentTitle?: string;
  className?: string;
}) {
  useEffect(() => {
    document.title = `${documentTitle ?? title} · SIMS`;
  }, [documentTitle, title]);

  return (
    <header
      className={cn(
        'flex flex-col gap-4 md:flex-row md:items-end md:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <p className="text-sm text-ink-muted">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink md:text-[1.75rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-sm text-ink-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
