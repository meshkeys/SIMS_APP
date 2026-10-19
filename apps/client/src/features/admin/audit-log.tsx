import type { AuditEventView } from '@sims/contracts';
import { useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useApiQuery } from '@/lib/api/query';
import { cn } from '@/lib/cn';

const PAGE_SIZE = 50;

/** "AUDIT_EVENT_TYPE" or "KpiActual" → "Kpi actual" */
const readable = (name: string) =>
  name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

interface Filters {
  action: string;
  entityType: string;
  from: string;
  to: string;
}
const NO_FILTERS: Filters = { action: '', entityType: '', from: '', to: '' };

/** Every recorded change, newest first. Nothing here can be edited. */
export function AuditLog() {
  const { organisation } = useSession();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const audit = useApiQuery(
    'listAudit',
    {
      query: {
        action: filters.action || undefined,
        entityType: filters.entityType || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        page,
        pageSize: PAGE_SIZE,
      },
    },
    { placeholderData: (previous) => previous },
  );
  const set = (change: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...change }));
    setPage(1);
  };
  const filtered = Object.values(filters).some(Boolean);
  const pages = audit.data
    ? Math.max(1, Math.ceil(audit.data.total / PAGE_SIZE))
    : 1;
  const when = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: organisation.timezone,
  });

  return (
    <Card aria-labelledby="audit-title">
      <CardHeader
        titleId="audit-title"
        title="Audit log"
        description="Every recorded change and sign-in, newest first. Entries cannot be edited or deleted."
      />
      <div className="grid gap-3 px-5 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Action">
          {(control) => (
            <Select
              {...control}
              value={filters.action}
              onChange={(e) => set({ action: e.target.value })}
            >
              <option value="">All actions</option>
              {(audit.data?.actions ?? []).map((action) => (
                <option key={action} value={action}>
                  {readable(action)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Record type">
          {(control) => (
            <Select
              {...control}
              value={filters.entityType}
              onChange={(e) => set({ entityType: e.target.value })}
            >
              <option value="">All records</option>
              {(audit.data?.entityTypes ?? []).map((type) => (
                <option key={type} value={type}>
                  {readable(type)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="From">
          {(control) => (
            <Input
              {...control}
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => set({ from: e.target.value })}
            />
          )}
        </Field>
        <Field label="To">
          {(control) => (
            <Input
              {...control}
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => set({ to: e.target.value })}
            />
          )}
        </Field>
      </div>
      {filtered && (
        <div className="px-5 pt-2">
          <Button variant="link" size="sm" onClick={() => set(NO_FILTERS)}>
            Clear filters
          </Button>
        </div>
      )}

      {audit.isPending ? (
        <div className="p-5">
          <output className="sr-only">Loading the audit log…</output>
          <Skeleton className="h-64" />
        </div>
      ) : audit.isError ? (
        <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
      ) : audit.data.items.length === 0 ? (
        <EmptyState
          title={
            filtered ? 'No entries match these filters' : 'Nothing recorded yet'
          }
          description={
            filtered ? 'Widen the dates or clear the filters.' : undefined
          }
        />
      ) : (
        <div
          className={cn(
            'overflow-x-auto p-5 pt-4',
            audit.isPlaceholderData && 'opacity-60',
          )}
        >
          <p className="mb-2 text-sm text-ink-muted" aria-live="polite">
            {audit.data.total} {audit.data.total === 1 ? 'entry' : 'entries'}
          </p>
          <table className="w-full text-sm">
            <caption className="sr-only">
              Audit log entries, newest first
            </caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-ink-muted">
                <th scope="col" className="py-2 pr-4 font-medium">
                  When
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Who
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  What
                </th>
                <th scope="col" className="py-2 font-medium">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {audit.data.items.map((event) => (
                <tr key={event.id} className="border-b border-border align-top">
                  <td className="py-2 pr-4 whitespace-nowrap text-ink-muted">
                    <time dateTime={event.at}>
                      {when.format(new Date(event.at))}
                    </time>
                  </td>
                  <td className="py-2 pr-4 text-ink">
                    {event.actor?.name ?? 'System'}
                  </td>
                  <th scope="row" className="py-2 pr-4 text-left font-normal">
                    <span className="block font-medium text-ink">
                      {event.actionLabel}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {readable(event.entityType)}
                    </span>
                  </th>
                  <td className="py-2">
                    <ChangeDetails event={event} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pages > 1 && (
            <nav
              aria-label="Pages of the audit log"
              className="mt-4 flex items-center justify-end gap-2 text-sm text-ink-muted"
            >
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Newer
              </Button>
              <span>
                Page {page} of {pages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Older
              </Button>
            </nav>
          )}
        </div>
      )}
    </Card>
  );
}

function ChangeDetails({ event }: { event: AuditEventView }) {
  if (event.before == null && event.after == null) {
    return <span className="text-ink-subtle">—</span>;
  }
  return (
    <details>
      <summary className="cursor-pointer text-primary">
        Show values
        <span className="sr-only"> for {event.actionLabel}</span>
      </summary>
      <dl className="mt-2 grid gap-2">
        {event.before != null && (
          <div>
            <dt className="text-xs font-medium text-ink-muted">Before</dt>
            <dd>
              <pre className="max-w-md overflow-x-auto rounded-md bg-surface-muted p-2 text-xs whitespace-pre-wrap">
                {JSON.stringify(event.before, null, 2)}
              </pre>
            </dd>
          </div>
        )}
        {event.after != null && (
          <div>
            <dt className="text-xs font-medium text-ink-muted">After</dt>
            <dd>
              <pre className="max-w-md overflow-x-auto rounded-md bg-surface-muted p-2 text-xs whitespace-pre-wrap">
                {JSON.stringify(event.after, null, 2)}
              </pre>
            </dd>
          </div>
        )}
      </dl>
    </details>
  );
}
