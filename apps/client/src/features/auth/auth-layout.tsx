import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/cn';

/**
 * The signed-out pages (sign in, sign up, accept an invitation): the brand
 * panel on wide screens, and one centred column for the form.
 */
export function AuthLayout({
  title,
  description,
  wide = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** A wider column, for longer forms. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-text lg:flex">
        <Brand />
        <div className="max-w-md">
          <p className="text-2xl leading-snug font-semibold text-white">
            Completion is not success.
          </p>
          <p className="mt-3 text-sidebar-muted">
            SIMS tracks whether delivered work is creating the value your
            strategy promised — with verified figures, not opinions.
          </p>
        </div>
        <p className="text-xs text-sidebar-muted">
          Strategic Initiative Management &amp; Execution Tracking
        </p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className={cn('w-full', wide ? 'max-w-xl' : 'max-w-sm')}>
          <div className="mb-8 lg:hidden">
            <Brand dark={false} />
          </div>
          <PageHeader title={title} description={description} />
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

export function Brand({ dark = true }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-md bg-canvas font-bold text-sidebar"
      >
        S
      </span>
      <span className="leading-tight">
        <span
          className={
            dark
              ? 'block font-semibold text-white'
              : 'block font-semibold text-ink'
          }
        >
          SIMS
        </span>
        <span
          className={
            dark
              ? 'block text-xs text-sidebar-muted'
              : 'block text-xs text-ink-muted'
          }
        >
          Strategy Execution Office
        </span>
      </span>
    </div>
  );
}
