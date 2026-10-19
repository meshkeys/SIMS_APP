import type {
  KpiActualRow,
  KpiActualsSheet,
  PeriodSummary,
} from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { hasAnyRole } from '@/lib/access';
import { errorMessage } from '@/lib/api/errors';
import { apiKey, useApiMutation, useApiQuery } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { formatKpiValue, plural } from '@/lib/format';

const route = getRouteApi('/app/performance/actuals');

const OFFICE_ROLES = ['STRATEGY_OFFICE', 'SYSTEM_ADMIN'] as const;

/** The cycle in progress, else the most recent one. */
const defaultPeriod = (periods: PeriodSummary[]) =>
  periods.find((p) => p.status !== 'LOCKED') ?? periods[0];

/**
 * One reporting period's KPI readings. Owners enter their own KPIs; the
 * Strategy Office enters any KPI (verified as saved) and verifies the rest.
 */
export function KpiActualsPage() {
  const search = route.useSearch();
  const session = useSession();
  const isOffice = hasAnyRole(session, OFFICE_ROLES);
  const periods = useApiQuery('listPeriods', {});
  const periodId =
    search.period ?? (periods.data && defaultPeriod(periods.data)?.id);
  const sheet = useApiQuery(
    'getKpiActuals',
    { params: { periodId: periodId ?? '' } },
    { enabled: !!periodId },
  );

  const header = (
    <PageHeader
      eyebrow="Performance · KPI actuals"
      title="Record KPI actuals"
      description={
        isOffice
          ? 'Enter each KPI’s reading for the period. Readings you save are verified at once; verify what owners entered.'
          : 'Enter the readings for the KPIs you own. The Strategy Office verifies them before they count.'
      }
      actions={
        <>
          {periods.data && periods.data.length > 0 && (
            <PeriodSelect periods={periods.data} value={periodId} />
          )}
          <Button variant="secondary" asChild>
            <Link to="/performance">Back to KPIs & benefits</Link>
          </Button>
        </>
      }
    />
  );

  if (periods.isPending || (periodId && sheet.isPending)) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <output className="sr-only">Loading KPI readings…</output>
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (periods.isError || sheet.isError) {
    const error = periods.error ?? sheet.error;
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <ErrorState
            error={error}
            onRetry={() =>
              void (periods.isError ? periods.refetch() : sheet.refetch())
            }
          />
        </Card>
      </div>
    );
  }
  if (!sheet.data) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <EmptyState
            title="No reporting period yet"
            description="KPI readings are recorded against a reporting period. The Strategy Office opens one each cycle."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      <SheetEditor
        key={sheet.data.period.id}
        sheet={sheet.data}
        isOffice={isOffice}
        membershipId={session.membership.id}
      />
    </div>
  );
}

function PeriodSelect({
  periods,
  value,
}: {
  periods: PeriodSummary[];
  value: string | undefined;
}) {
  const navigate = useNavigate();
  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      Period
      <Select
        value={value ?? ''}
        className="w-auto min-w-44"
        onChange={(event) =>
          void navigate({
            to: '/performance/actuals',
            search: { period: event.target.value },
            replace: true,
          })
        }
      >
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.status === 'LOCKED' ? ' (locked)' : ''}
          </option>
        ))}
      </Select>
    </label>
  );
}

interface Draft {
  value: string;
  commentary: string;
}

const draftsFrom = (sheet: KpiActualsSheet): Record<string, Draft> =>
  Object.fromEntries(
    sheet.rows.map((row) => [
      row.kpi.id,
      {
        value: row.actual ? String(row.actual.value) : '',
        commentary: row.actual?.commentary ?? '',
      },
    ]),
  );

/** What is wrong with a row's entry, if anything (null when it is fine or untouched). */
function problemWith(row: KpiActualRow, draft: Draft): string | null {
  const value = draft.value.trim();
  if (value === '') {
    if (row.actual) return 'Enter a reading; a saved one cannot be cleared';
    return draft.commentary.trim()
      ? 'Enter a reading to go with the note'
      : null;
  }
  return Number.isFinite(Number(value)) ? null : 'Enter a number, like 23.5';
}

function isChanged(row: KpiActualRow, draft: Draft) {
  const value = draft.value.trim();
  const commentary = draft.commentary.trim();
  if (!row.actual) return value !== '';
  return (
    Number(value) !== row.actual.value ||
    commentary !== (row.actual.commentary ?? '')
  );
}

function SheetEditor({
  sheet,
  isOffice,
  membershipId,
}: {
  sheet: KpiActualsSheet;
  isOffice: boolean;
  membershipId: string;
}) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState(() => draftsFrom(sheet));
  const [notice, setNotice] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const params = { periodId: sheet.period.id };

  const apply = async (next: KpiActualsSheet, message: string) => {
    queryClient.setQueryData(apiKey('getKpiActuals', { params }), next);
    setDrafts(draftsFrom(next));
    setShowErrors(false);
    setNotice(message);
    // KPI positions, scorecards and rollups may all have moved.
    await queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== 'getKpiActuals',
    });
  };
  const record = useApiMutation('recordKpiActuals');
  const verify = useApiMutation('verifyKpiActuals');

  // Owners see the KPIs they own; the Strategy Office sees every KPI.
  const rows = isOffice
    ? sheet.rows
    : sheet.rows.filter((r) => r.owner?.membershipId === membershipId);
  const changed = rows.filter(
    (r) => r.can.record && isChanged(r, drafts[r.kpi.id]!),
  );
  const problems = new Map(
    rows
      .filter((r) => r.can.record)
      .map((r) => [r.kpi.id, problemWith(r, drafts[r.kpi.id]!)] as const)
      .filter((entry): entry is [string, string] => entry[1] !== null),
  );
  const toVerify = rows.filter((r) => r.can.verify);
  const busy = record.isPending || verify.isPending;

  const save = () => {
    setNotice(null);
    if (problems.size > 0) {
      setShowErrors(true);
      return;
    }
    record.mutate(
      {
        params,
        body: {
          actuals: changed.map((r) => ({
            kpiId: r.kpi.id,
            value: Number(drafts[r.kpi.id]!.value.trim()),
            commentary: drafts[r.kpi.id]!.commentary.trim() || null,
          })),
        },
      },
      {
        onSuccess: (next) =>
          apply(next, `Saved ${plural(changed.length, 'reading')}.`),
      },
    );
  };
  const verifyRows = (ids: string[]) => {
    setNotice(null);
    verify.mutate(
      { params, body: { kpiIds: ids } },
      {
        onSuccess: (next) =>
          apply(next, `Verified ${plural(ids.length, 'reading')}.`),
      },
    );
  };
  const error = record.error ?? verify.error;

  return (
    <>
      {!sheet.open && (
        <Alert tone="info" title={`${sheet.period.name} is locked`}>
          Its readings are part of the record and can no longer change.
        </Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && (
        <Alert tone="danger" title="Nothing was saved">
          {errorMessage(error)}
        </Alert>
      )}
      {showErrors && problems.size > 0 && (
        <Alert tone="danger" title="Check the highlighted readings">
          {plural(problems.size, 'reading needs', 'readings need')} fixing
          before you save.
        </Alert>
      )}

      <Card aria-labelledby="sheet-title">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <h2 id="sheet-title" className="font-semibold text-ink">
              {sheet.period.name} readings
            </h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              {sheet.counts.recorded} of {sheet.counts.kpis} recorded ·{' '}
              {sheet.counts.verified} verified
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {toVerify.length > 0 && (
              <Button
                variant="secondary"
                disabled={busy || changed.length > 0}
                loading={verify.isPending}
                onClick={() => verifyRows(toVerify.map((r) => r.kpi.id))}
              >
                Verify all ({toVerify.length})
              </Button>
            )}
            {sheet.open && rows.some((r) => r.can.record) && (
              <Button
                disabled={busy || changed.length === 0}
                loading={record.isPending}
                onClick={save}
              >
                {changed.length > 0
                  ? `Save ${plural(changed.length, 'reading')}`
                  : 'Save readings'}
              </Button>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            className="py-8"
            title="You do not own any KPIs"
            description="KPI owners are set on the strategy map. Ask the Strategy Office if you should own one."
          />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[60rem] text-sm">
              <caption className="sr-only">
                KPI readings for {sheet.period.name}
              </caption>
              <thead className="bg-surface-muted">
                <tr>
                  {[
                    'KPI',
                    'Owner',
                    'Previous',
                    'Target',
                    'Reading',
                    'Note',
                    'Status',
                  ].map((heading, i) => (
                    <th
                      key={heading}
                      scope="col"
                      className={cn(
                        'px-3 py-2.5 text-left text-xs font-medium text-ink-muted',
                        i === 0 && 'pl-5',
                        i === 6 && 'pr-5',
                      )}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <ReadingRow
                    key={row.kpi.id}
                    row={row}
                    period={sheet.period.name}
                    draft={drafts[row.kpi.id]!}
                    problem={showErrors ? problems.get(row.kpi.id) : undefined}
                    changed={changed.includes(row)}
                    busy={busy}
                    onChange={(draft) =>
                      setDrafts((all) => ({ ...all, [row.kpi.id]: draft }))
                    }
                    onVerify={() => verifyRows([row.kpi.id])}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function ReadingRow({
  row,
  period,
  draft,
  problem,
  changed,
  busy,
  onChange,
  onVerify,
}: {
  row: KpiActualRow;
  period: string;
  draft: Draft;
  problem: string | undefined;
  changed: boolean;
  busy: boolean;
  onChange: (draft: Draft) => void;
  onVerify: () => void;
}) {
  const { kpi, actual } = row;
  const name = `${kpi.code} ${kpi.name}`;
  const errorId = `reading-error-${kpi.id}`;
  return (
    <tr className={cn(changed && 'bg-primary-soft/40')}>
      <th scope="row" className="px-3 py-3 pl-5 text-left font-normal">
        <span className="block font-mono text-xs text-ink-muted">
          {kpi.code}
        </span>
        <span className="block font-medium text-ink">{kpi.name}</span>
        <span className="block text-xs text-ink-muted">
          {row.topLevel.title}
        </span>
      </th>
      <td className="px-3 py-3 text-ink-muted">
        {row.owner?.jobTitle ?? row.owner?.name ?? '—'}
      </td>
      <td className="tabular px-3 py-3">
        {row.previous ? (
          <>
            {formatKpiValue(row.previous.value, kpi.unit)}
            <span className="block text-xs text-ink-muted">
              {row.previous.period}
            </span>
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="tabular px-3 py-3">
        {formatKpiValue(row.target, kpi.unit)}
        {row.targetLabel && (
          <span className="block text-xs text-ink-muted">
            {row.targetLabel}
          </span>
        )}
      </td>
      <td className="px-3 py-3 align-top">
        {row.can.record ? (
          <>
            <div className="flex items-center gap-1.5">
              <Input
                inputMode="decimal"
                className="h-9 w-24"
                aria-label={`${period} reading for ${name} (${kpi.unit})`}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? errorId : undefined}
                value={draft.value}
                disabled={busy}
                onChange={(e) => onChange({ ...draft, value: e.target.value })}
              />
              <span className="text-xs text-ink-muted">{kpi.unit}</span>
            </div>
            {problem && (
              <p id={errorId} className="mt-1 max-w-48 text-xs text-danger">
                {problem}
              </p>
            )}
          </>
        ) : (
          <span className="tabular">
            {formatKpiValue(actual?.value ?? null, kpi.unit)}
          </span>
        )}
      </td>
      <td className="px-3 py-3 align-top">
        {row.can.record ? (
          <Input
            className="h-9 min-w-48"
            aria-label={`Note for ${name}`}
            placeholder="What moved it (optional)"
            maxLength={1000}
            value={draft.commentary}
            disabled={busy}
            onChange={(e) => onChange({ ...draft, commentary: e.target.value })}
          />
        ) : (
          <span className="text-ink-muted">{actual?.commentary ?? '—'}</span>
        )}
      </td>
      <td className="px-3 py-3 pr-5">
        {!actual ? (
          <Badge tone="neutral">Not recorded</Badge>
        ) : actual.verified ? (
          <Badge tone="success">Verified</Badge>
        ) : (
          <Badge tone="warning">Awaiting verification</Badge>
        )}
        {row.can.verify && (
          <Button
            variant="link"
            size="sm"
            className="ml-2"
            aria-label={`Verify ${kpi.code}`}
            disabled={busy || changed}
            onClick={onVerify}
          >
            Verify
          </Button>
        )}
      </td>
    </tr>
  );
}
