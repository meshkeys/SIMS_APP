import type {
  Health,
  RegisterItem,
  RegisterPage as Page,
} from '@sims/contracts';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { HealthBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { Meter } from '@/components/ui/meter';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useApiQuery } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { useSession } from '@/auth/use-auth';
import {
  formatDate,
  formatInstantDay,
  formatPercent,
  plural,
} from '@/lib/format';
import { HEALTH_DISPLAY } from '@/lib/health';
import { type RegisterSearch, SORTS } from './register-search';

const route = getRouteApi('/app/initiatives');
const PAGE_SIZE = 10;

const TABS = [
  { key: 'active', label: 'Active', note: undefined },
  { key: 'pipeline', label: 'Pipeline', note: 'awaiting approval' },
  { key: 'closed', label: 'Closed', note: 'benefits tracking' },
  { key: 'cancelled', label: 'Cancelled', note: undefined },
] as const;

/** Worst first, the order the register sorts by. */
const CHIPS: Health[] = ['RED', 'AMBER', 'GREEN', 'UNKNOWN'];

/** The initiative register: every initiative, filtered, sorted and paged. */
export function RegisterPage() {
  const search = route.useSearch();
  const navigate = useNavigate();
  const tab = search.tab ?? 'active';
  const sort = search.sort ?? 'health';

  /** Changes filters; any change but paging goes back to page 1. */
  const update = useCallback(
    (changes: Partial<RegisterSearch>, replace = false) =>
      void navigate({
        to: '/initiatives',
        search: (previous) => ({ ...previous, page: undefined, ...changes }),
        replace,
      }),
    [navigate],
  );

  const register = useApiQuery(
    'listInitiatives',
    {
      query: {
        tab,
        sort,
        health: search.health,
        q: search.q,
        elementId: search.elementId,
        page: search.page ?? 1,
        pageSize: PAGE_SIZE,
      },
    },
    { placeholderData: (previous) => previous },
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Initiatives · Approved portfolio"
        title="Initiative register"
      />

      {register.data && (
        <Tabs
          current={tab}
          counts={register.data.tabCounts}
          onSelect={(key) =>
            update({
              tab: key === 'active' ? undefined : key,
              health: undefined,
            })
          }
        />
      )}

      <Filters search={search} onChange={update} />

      {register.data && (
        <HealthChips
          current={search.health}
          page={register.data}
          onSelect={(health) => update({ health })}
        />
      )}

      <Card aria-busy={register.isFetching || undefined}>
        {register.isPending ? (
          <TableSkeleton />
        ) : register.isError ? (
          <ErrorState
            error={register.error}
            onRetry={() => void register.refetch()}
            title="The register could not be loaded"
          />
        ) : register.data.items.length === 0 ? (
          <NoResults
            filtered={!!(search.q || search.health || search.elementId)}
            onClear={() =>
              update({ q: undefined, health: undefined, elementId: undefined })
            }
          />
        ) : (
          <>
            <ResultsBar
              page={register.data}
              sort={sort}
              onSort={(value) =>
                update({ sort: value === 'health' ? undefined : value })
              }
            />
            <RegisterTable items={register.data.items} />
            <Pagination
              page={register.data}
              onPage={(page) => update({ page: page === 1 ? undefined : page })}
            />
          </>
        )}
      </Card>
    </div>
  );
}

function Tabs({
  current,
  counts,
  onSelect,
}: {
  current: string;
  counts: Page['tabCounts'];
  onSelect: (key: (typeof TABS)[number]['key']) => void;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 gap-1 overflow-x-auto border-0 border-b border-border p-0">
      <legend className="sr-only">Initiative status</legend>
      {TABS.map((t) => {
        const selected = t.key === current;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(t.key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors',
              selected
                ? 'border-ink font-semibold text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
            {t.note && ` · ${counts[t.key]} ${t.note}`}
            {!t.note && ` · ${counts[t.key]}`}
          </button>
        );
      })}
    </fieldset>
  );
}

function Filters({
  search,
  onChange,
}: {
  search: RegisterSearch;
  onChange: (changes: Partial<RegisterSearch>, replace?: boolean) => void;
}) {
  const map = useApiQuery('getCurrentStrategyMap', {});
  const pillars = map.data?.elements.filter((e) => e.parentId === null) ?? [];
  const pillarLabel = map.data?.levels[0];

  // Typing updates the URL after a short pause, without filling the history.
  const [text, setText] = useState(search.q ?? '');
  // When the URL changes from elsewhere (Back, Clear filters), show it — but
  // not when it is just our own trimmed text, or "foo " would lose its space.
  const [syncedQ, setSyncedQ] = useState(search.q);
  if (search.q !== syncedQ) {
    setSyncedQ(search.q);
    if ((search.q ?? '') !== text.trim()) setText(search.q ?? '');
  }
  useEffect(() => {
    const value = text.trim();
    if (value === (search.q ?? '')) return;
    const timer = setTimeout(
      () => onChange({ q: value || undefined }, true),
      300,
    );
    return () => clearTimeout(timer);
  }, [text, search.q, onChange]);

  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <div className="relative flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
        />
        <Input
          type="search"
          aria-label="Search initiatives"
          placeholder="Search by name, ID or owner"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="pl-9"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-muted md:w-72">
        <span className="shrink-0">{pillarLabel?.label ?? 'Pillar'}</span>
        <Select
          value={search.elementId ?? ''}
          disabled={!map.data}
          onChange={(event) =>
            onChange({ elementId: event.target.value || undefined })
          }
        >
          <option value="">
            All {pillarLabel?.pluralLabel.toLowerCase() ?? 'pillars'}
          </option>
          {pillars.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}

function HealthChips({
  current,
  page,
  onSelect,
}: {
  current: Health | undefined;
  page: Page;
  onSelect: (health: Health | undefined) => void;
}) {
  const total = Object.values(page.healthCounts).reduce((a, b) => a + b, 0);
  const chip = (selected: boolean) =>
    cn(
      'rounded-full border px-3 py-1.5 text-sm transition-colors',
      selected
        ? 'border-ink bg-ink font-medium text-white'
        : 'border-border-strong bg-surface text-ink hover:border-ink-subtle',
    );
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
      <legend className="sr-only">Filter by health</legend>
      <button
        type="button"
        aria-pressed={!current}
        className={chip(!current)}
        onClick={() => onSelect(undefined)}
      >
        All · {total}
      </button>
      {CHIPS.filter(
        (h) => h !== 'UNKNOWN' || page.healthCounts.UNKNOWN > 0,
      ).map((health) => (
        <button
          key={health}
          type="button"
          aria-pressed={current === health}
          className={chip(current === health)}
          onClick={() => onSelect(current === health ? undefined : health)}
        >
          {HEALTH_DISPLAY[health].label} · {page.healthCounts[health]}
        </button>
      ))}
    </fieldset>
  );
}

function ResultsBar({
  page,
  sort,
  onSort,
}: {
  page: Page;
  sort: keyof typeof SORTS;
  onSort: (sort: keyof typeof SORTS) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border px-5 py-3 text-sm text-ink-muted md:flex-row md:items-center md:justify-between">
      <p aria-live="polite">
        Showing {plural(page.items.length, 'initiative')} of {page.total} ·
        sorted by {SORTS[sort].toLowerCase()}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-xs">
          Bar = verified weighted completion · tick = planned today
        </p>
        <label className="flex items-center gap-2">
          Sort
          <Select
            value={sort}
            onChange={(event) =>
              onSort(event.target.value as keyof typeof SORTS)
            }
            className="h-8 w-auto"
          >
            {Object.entries(SORTS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
      </div>
    </div>
  );
}

function RegisterTable({ items }: { items: RegisterItem[] }) {
  const th = 'px-3 py-2.5 text-left text-xs font-medium text-ink-muted';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[60rem] text-sm">
        <caption className="sr-only">
          Initiatives with owner, due date, execution against plan, health,
          impact and last update
        </caption>
        <thead className="bg-surface-muted">
          <tr>
            <th scope="col" className={cn(th, 'pl-5')}>
              ID
            </th>
            <th scope="col" className={th}>
              Initiative
            </th>
            <th scope="col" className={th}>
              Owner · Sponsor
            </th>
            <th scope="col" className={th}>
              Due
            </th>
            <th scope="col" className={cn(th, 'w-52')}>
              Execution
            </th>
            <th scope="col" className={th}>
              Health
            </th>
            <th scope="col" className={th}>
              Impact
            </th>
            <th scope="col" className={cn(th, 'pr-5')}>
              Last update
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ item }: { item: RegisterItem }) {
  const timeZone = useSession().organisation.timezone;
  const td = 'px-3 py-3 align-top';
  const variance = item.variancePp;
  return (
    <tr className="hover:bg-surface-muted/60">
      <td className={cn(td, 'pl-5 font-mono text-xs text-ink-muted')}>
        {item.code}
      </td>
      <th scope="row" className={cn(td, 'max-w-56 text-left font-normal')}>
        <Link
          to="/initiatives/$id"
          params={{ id: item.id }}
          className="font-medium text-ink hover:underline"
        >
          {item.title}
        </Link>
        {item.pillar && (
          <span className="block text-xs text-ink-muted">
            {item.pillar.title}
          </span>
        )}
        {item.isSensitive && (
          <span className="block text-xs text-impact-text">Restricted</span>
        )}
      </th>
      <td className={cn(td, 'max-w-44')}>
        <span className="block text-ink">
          {item.owner?.jobTitle ?? item.owner?.name ?? 'No owner'}
        </span>
        <span className="block text-xs text-ink-muted">
          {item.sponsor?.jobTitle ?? item.sponsor?.name ?? 'No sponsor'}
        </span>
      </td>
      <td className={cn(td, 'tabular whitespace-nowrap')}>
        {item.dueDate ? formatDate(item.dueDate) : '—'}
        {item.forecastEnd &&
          item.dueDate &&
          item.forecastEnd > item.dueDate && (
            <span className="block text-xs text-danger">
              Forecast {formatDate(item.forecastEnd)}
            </span>
          )}
      </td>
      <td className={td}>
        <div className="flex items-center gap-2">
          <Meter
            value={item.verifiedProgress}
            label={`Verified progress, ${item.title}`}
            marker={{ value: item.plannedProgress, label: 'planned' }}
            className="flex-1"
          />
          <span className="tabular w-10 text-right font-medium">
            {formatPercent(item.verifiedProgress)}
          </span>
        </div>
        <span
          className={cn(
            'tabular mt-1 block text-xs',
            variance < -5 ? 'text-danger' : 'text-ink-muted',
          )}
        >
          {variance > 0 ? '+' : ''}
          {variance} pp vs plan
        </span>
      </td>
      <td className={td}>
        <HealthBadge health={item.health} />
        {item.overridden && (
          <span className="mt-1 block text-xs text-ink-muted">Overridden</span>
        )}
      </td>
      <td className={cn(td, 'max-w-40 text-ink')}>
        {item.impactSummary ??
          (item.impactScore === null
            ? 'Not yet measurable'
            : `${formatPercent(item.impactScore)} of target`)}
      </td>
      <td className={cn(td, 'pr-5 whitespace-nowrap')}>
        {item.updateOverdue ? (
          <span className="text-danger" title={item.updateOverdue.detail}>
            {item.lastUpdateAt
              ? `${formatInstantDay(item.lastUpdateAt, timeZone)} · `
              : ''}
            overdue
          </span>
        ) : item.lastUpdateAt ? (
          formatInstantDay(item.lastUpdateAt, timeZone)
        ) : (
          <span className="text-ink-muted">None yet</span>
        )}
      </td>
    </tr>
  );
}

function Pagination({
  page,
  onPage,
}: {
  page: Page;
  onPage: (page: number) => void;
}) {
  if (page.totalPages <= 1) return null;
  return (
    <nav
      aria-label="Pages"
      className="flex items-center justify-between border-t border-border px-5 py-3 text-sm"
    >
      <p className="text-ink-muted">
        Page {page.page} of {page.totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page.page <= 1}
          onClick={() => onPage(page.page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page.page >= page.totalPages}
          onClick={() => onPage(page.page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

function NoResults({
  filtered,
  onClear,
}: {
  filtered: boolean;
  onClear: () => void;
}) {
  return filtered ? (
    <EmptyState
      title="No initiatives match these filters"
      description="Try a different search, health or pillar."
      action={
        <Button variant="secondary" size="sm" onClick={onClear}>
          <X aria-hidden="true" />
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      title="Nothing here yet"
      description="Initiatives appear here as they move through their lifecycle."
    />
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-5">
      <output className="sr-only">Loading initiatives…</output>
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}
