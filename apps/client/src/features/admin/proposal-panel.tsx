import {
  describeRulesetChanges,
  type RulesetConfig,
  type RulesetImpact,
  type RulesetView,
} from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/form';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation, useApiQuery } from '@/lib/api/query';
import { formatInstantDate, plural } from '@/lib/format';
import { HEALTH_DISPLAY, TRAJECTORY_DISPLAY } from '@/lib/health';
import { useDebounced } from '@/lib/use-debounced';
import { draftErrors } from './rules-draft';

/**
 * The edited rules against the live ones: what changes, what it would do to
 * today's portfolio, and proposing it for the MD/CEO's approval.
 */
export function ProposalPanel({
  live,
  draft,
  valid,
  onDiscard,
  onProposed,
}: {
  live: RulesetConfig;
  draft: RulesetConfig;
  valid: boolean;
  onDiscard: () => void;
  onProposed: (view: RulesetView) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const changes = describeRulesetChanges(live, draft);
  // Wait for the edits to settle before asking the server.
  const settled = useDebounced(draft, 400);
  const settledChanges = describeRulesetChanges(live, settled).length > 0;
  const impact = useApiQuery(
    'previewRuleset',
    { body: { config: settled } },
    {
      enabled: settledChanges && draftErrors(settled).size === 0,
      placeholderData: (previous) => previous,
    },
  );
  const propose = useApiMutation('proposeRuleset', {
    onSuccess: async (view) => {
      await queryClient.invalidateQueries();
      setReason('');
      onProposed(view);
    },
  });

  if (changes.length === 0) return null;
  return (
    <Card aria-labelledby="proposal-title" className="border-2 border-primary">
      <CardHeader
        titleId="proposal-title"
        title="Proposed changes"
        description="Proposed here, approved by the MD/CEO in Decisions required, logged in full."
      />
      <CardBody className="flex flex-col gap-5">
        <ul className="list-disc pl-5 text-sm text-ink">
          {changes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        {!valid ? (
          <Alert tone="warning">
            Fix the highlighted settings to see their impact.
          </Alert>
        ) : impact.isError ? (
          <ErrorState
            error={impact.error}
            onRetry={() => void impact.refetch()}
          />
        ) : !impact.data ? (
          <Skeleton className="h-32" />
        ) : (
          <ImpactPreview impact={impact.data} stale={impact.isFetching} />
        )}

        {propose.error && (
          <Alert tone="danger">{errorMessage(propose.error)}</Alert>
        )}
        <Field
          label="Why change the rules"
          hint="Shown to the MD/CEO with the decision."
          required
        >
          {(c) => (
            <Textarea
              {...c}
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onDiscard}>
            Discard changes
          </Button>
          <Button
            loading={propose.isPending}
            disabled={!valid || reason.trim().length < 10}
            onClick={() =>
              propose.mutate({
                body: { config: draft, changeSummary: reason.trim() },
              })
            }
          >
            Propose for approval
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function ImpactPreview({
  impact,
  stale,
}: {
  impact: RulesetImpact;
  stale: boolean;
}) {
  const { health, kpis, lowValue } = impact;
  const cols = ['GREEN', 'AMBER', 'RED', 'UNKNOWN'] as const;
  return (
    <section
      aria-label="Impact on today's portfolio"
      aria-busy={stale || undefined}
    >
      <h3 className="text-sm font-semibold text-ink">
        Impact preview on the current portfolio (
        {plural(health.initiatives, 'initiative')})
      </h3>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th scope="col" className="py-1.5 font-medium">
              <span className="sr-only">Rules</span>
            </th>
            {cols.map((h) => (
              <th key={h} scope="col" className="py-1.5 font-medium">
                {HEALTH_DISPLAY[h].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border">
            <th scope="row" className="py-2 text-left font-normal">
              Live rules
            </th>
            {cols.map((h) => (
              <td key={h} className="tabular py-2">
                {health.live[h]}
              </td>
            ))}
          </tr>
          <tr className="border-t border-border bg-surface-muted">
            <th scope="row" className="py-2 text-left font-semibold">
              Proposed
            </th>
            {cols.map((h) => (
              <td key={h} className="tabular py-2 font-semibold">
                {health.proposed[h]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {health.changes.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">
          No initiative would change status.
        </p>
      ) : (
        <ul
          className="mt-2 flex flex-col gap-1 text-sm"
          aria-label="Initiatives that would change status"
        >
          {health.changes.map((c) => (
            <li key={c.code}>
              <span className="font-mono text-xs text-ink-muted">{c.code}</span>{' '}
              {c.title}: {HEALTH_DISPLAY[c.from].label} →{' '}
              <strong>{HEALTH_DISPLAY[c.to].label}</strong>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm text-ink-muted">
        {kpis.changes.length === 0
          ? 'No KPI would change trajectory.'
          : `KPIs: ${kpis.changes
              .map(
                (k) =>
                  `${k.code} ${TRAJECTORY_DISPLAY[k.from].label.toLowerCase()} → ${TRAJECTORY_DISPLAY[k.to].label.toLowerCase()}`,
              )
              .join('; ')}.`}{' '}
        Delivered but low value: {lowValue.live} → {lowValue.proposed}.
      </p>
    </section>
  );
}

/** A proposal waiting for the MD/CEO: what it changes, and withdrawing it. */
export function PendingProposal({ pending }: { pending: RulesetView }) {
  const { organisation } = useSession();
  const queryClient = useQueryClient();
  const withdraw = useApiMutation('withdrawRuleset', {
    onSuccess: () => queryClient.invalidateQueries(),
  });
  return (
    <Alert
      tone="info"
      title={`Version ${pending.version} is waiting for MD/CEO approval`}
    >
      <p>
        Proposed by {pending.proposedBy?.name ?? 'the Strategy Office'}
        {pending.createdAt
          ? ` on ${formatInstantDate(pending.createdAt, organisation.timezone)}`
          : ''}
        : “{pending.changeSummary}”. Editing reopens once it is decided.
      </p>
      <ul className="mt-1 list-disc pl-5">
        {pending.changes.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {withdraw.error && <p className="mt-1">{errorMessage(withdraw.error)}</p>}
      {pending.can.withdraw && (
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          loading={withdraw.isPending}
          onClick={() =>
            pending.id && withdraw.mutate({ params: { id: pending.id } })
          }
        >
          Withdraw proposal
        </Button>
      )}
    </Alert>
  );
}

const STATUS = {
  ACTIVE: { label: 'Active', tone: 'success' },
  PENDING_APPROVAL: { label: 'Waiting for approval', tone: 'info' },
  SUPERSEDED: { label: 'Superseded', tone: 'neutral' },
  REJECTED: { label: 'Rejected or withdrawn', tone: 'danger' },
  DRAFT: { label: 'Draft', tone: 'neutral' },
} as const;

/** Every version of the rules, newest first. */
export function RuleVersions({ history }: { history: RulesetView[] }) {
  const { organisation } = useSession();
  return (
    <Card aria-labelledby="versions-title">
      <CardHeader
        titleId="versions-title"
        title="Rule versions"
        description="Every change, who proposed and approved it, and when it took effect."
      />
      <CardBody>
        {history.length === 0 ? (
          <p className="text-sm text-ink-muted">
            The organisation runs on the default rules; no version has been
            saved yet.
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {history.map((v) => (
              <li key={v.id} className="py-3 first:pt-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">
                    Version {v.version}
                  </span>
                  <Badge tone={STATUS[v.status].tone}>
                    {STATUS[v.status].label}
                  </Badge>
                </p>
                {v.changeSummary && (
                  <p className="mt-1 text-sm text-ink">{v.changeSummary}</p>
                )}
                {v.changes.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-sm text-ink-muted">
                    {v.changes.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-xs text-ink-subtle">
                  {[
                    v.proposedBy && `Proposed by ${v.proposedBy.name}`,
                    v.approvedBy && `approved by ${v.approvedBy.name}`,
                    v.effectiveFrom &&
                      `in force from ${formatInstantDate(v.effectiveFrom, organisation.timezone)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
