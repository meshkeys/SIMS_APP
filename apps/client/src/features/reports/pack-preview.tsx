import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { PreviewPage } from './pack-pages';

/** One page at a time, with previous and next. */
export function PackPreview({
  pages,
  page,
  onPage,
  loading,
}: {
  pages: PreviewPage[];
  page: number;
  onPage: (page: number) => void;
  loading: boolean;
}) {
  const current = pages[Math.min(page, pages.length - 1)];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-right text-sm text-ink-muted" aria-live="polite">
        Page {Math.min(page, pages.length - 1) + 1} of {pages.length}
      </p>
      <figure
        className={cn(
          'm-0 aspect-[297/210] overflow-hidden rounded-md border border-border bg-surface p-3 text-[9px] leading-snug text-ink shadow-card',
          loading && 'opacity-60',
        )}
        aria-label={`Preview, page ${page + 1}: ${current?.title ?? ''}`}
      >
        {current && (
          <>
            <h3
              className={cn(
                'mb-2 font-semibold text-primary',
                page === 0 ? 'text-sm' : 'text-[11px]',
              )}
            >
              {current.title}
            </h3>
            {current.body}
          </>
        )}
      </figure>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
        >
          Previous page
        </Button>
        <Button
          variant="secondary"
          disabled={page >= pages.length - 1}
          onClick={() => onPage(page + 1)}
        >
          Next page
        </Button>
      </div>
    </div>
  );
}
