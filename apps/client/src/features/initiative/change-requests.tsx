import type { ChangeRequestView, InitiativeDetail } from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation, useApiQuery } from '@/lib/api/query';
import { formatDate, formatInstantDate, formatMoney } from '@/lib/format';

const TONE: Record<
  ChangeRequestView['status'],
  'info' | 'success' | 'danger' | 'neutral'
> = {
  PENDING: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
};
const STATUS_WORDS: Record<ChangeRequestView['status'], string> = {
  PENDING: 'Awaiting decision',
  APPROVED: 'Approved and applied',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};
const TYPE_WORDS: Partial<Record<ChangeRequestView['type'], string>> = {
  BASELINE_CHANGE: 'Dates and milestones',
  BUDGET_CHANGE: 'Budget',
  SCOPE_CHANGE: 'Scope',
};

/** Change requests for one initiative, newest first, with what each changes. */
export function ChangeRequests({
  initiative,
}: {
  initiative: InitiativeDetail;
}) {
  const session = useSession();
  const timeZone = session.organisation.timezone;
  const navigate = useNavigate();
  const notice = useRouterState({ select: (s) => s.location.state.notice });
  const requests = useApiQuery('listChangeRequests', {
    query: { initiativeId: initiative.id },
  });
  const [withdrawing, setWithdrawing] = useState<ChangeRequestView | null>(
    null,
  );
  const isOffice = session.membership.roles.some(
    (r) => r === 'STRATEGY_OFFICE' || r === 'SYSTEM_ADMIN',
  );

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <Alert tone="success">
          <span className="flex items-start justify-between gap-3">
            {notice}
            <button
              type="button"
              className="shrink-0 underline underline-offset-4"
              onClick={() =>
                void navigate({
                  to: '/initiatives/$id',
                  params: { id: initiative.id },
                  search: { tab: 'changes' },
                  state: {},
                  replace: true,
                })
              }
            >
              Dismiss
            </button>
          </span>
        </Alert>
      )}
      <Card>
        <CardBody>
          {requests.isPending ? (
            <Skeleton className="h-24" />
          ) : requests.isError ? (
            <ErrorState
              error={requests.error}
              onRetry={() => void requests.refetch()}
            />
          ) : requests.data.length === 0 ? (
            <EmptyState
              title="No change requests"
              description="Once active, changes to the baseline dates, budget or scope go through an approved change request."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {requests.data.map((cr) => {
                const mine =
                  cr.requestedBy?.membershipId === session.membership.id;
                return (
                  <li
                    key={cr.id}
                    className="rounded-md border border-border p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs text-ink-muted">
                        {cr.reference}
                      </span>
                      <Badge tone={TONE[cr.status]}>
                        {STATUS_WORDS[cr.status]}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm font-medium text-ink">
                      {TYPE_WORDS[cr.type] ?? 'Change'}
                    </p>
                    <ChangeList
                      request={cr}
                      initiative={initiative}
                      currency={session.organisation.currency}
                    />
                    {cr.justification && (
                      <p className="mt-2 text-sm text-ink">
                        “{cr.justification}”
                      </p>
                    )}
                    <p className="mt-2 text-xs text-ink-muted">
                      Requested by {cr.requestedBy?.name ?? 'unknown'} on{' '}
                      {formatInstantDate(cr.createdAt, timeZone)}
                      {cr.approver &&
                        cr.status === 'PENDING' &&
                        ` · waiting for ${cr.approver.name}`}
                      {cr.approver &&
                        cr.status !== 'PENDING' &&
                        cr.decidedAt &&
                        ` · decided by ${cr.approver.name} on ${formatInstantDate(cr.decidedAt, timeZone)}`}
                    </p>
                    {cr.decisionReason && (
                      <p className="mt-1 text-xs text-ink-muted">
                        Decision: “{cr.decisionReason}”
                      </p>
                    )}
                    {cr.status === 'PENDING' && (mine || isOffice) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-3"
                        onClick={() => setWithdrawing(cr)}
                        aria-label={`Withdraw ${cr.reference}`}
                      >
                        Withdraw
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
      {withdrawing && (
        <WithdrawDialog
          request={withdrawing}
          onClose={() => setWithdrawing(null)}
        />
      )}
    </div>
  );
}

/** "Budget: ₦500m → ₦550m", "Commercial launch due: 31 Dec 2026 → 31 Jan 2027". */
function ChangeList({
  request,
  initiative,
  currency,
}: {
  request: ChangeRequestView;
  initiative: InitiativeDetail;
  currency: string;
}) {
  const { changes, before } = request;
  const lines: string[] = [];
  const date = (v: unknown) =>
    typeof v === 'string' ? formatDate(v) : 'not set';
  if ('baselineStart' in changes)
    lines.push(
      `Start: ${date(before.baselineStart)} → ${date(changes.baselineStart)}`,
    );
  if ('baselineEnd' in changes)
    lines.push(
      `End: ${date(before.baselineEnd)} → ${date(changes.baselineEnd)}`,
    );
  if ('baselineBudget' in changes) {
    const money = (v: unknown) =>
      typeof v === 'number' ? formatMoney(v, currency) : 'not set';
    lines.push(
      `Budget: ${money(before.baselineBudget)} → ${money(changes.baselineBudget)}`,
    );
  }
  if ('scope' in changes) lines.push('Scope rewritten');
  const titles = new Map(initiative.milestones.map((m) => [m.id, m.title]));
  for (const m of changes.milestones ?? []) {
    const name = titles.get(m.milestoneId) ?? 'A milestone';
    if (m.baselineDate)
      lines.push(`${name} due: ${formatDate(m.baselineDate)}`);
    if (m.weight !== undefined) lines.push(`${name} weight: ${m.weight}%`);
  }
  for (const m of changes.addMilestones ?? [])
    lines.push(`New milestone: ${m.title}`);
  if (changes.removeMilestoneIds?.length)
    lines.push(`${changes.removeMilestoneIds.length} milestone(s) removed`);
  if (lines.length === 0) return null;
  return (
    <ul className="mt-1 list-disc pl-5 text-sm text-ink">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

function WithdrawDialog({
  request,
  onClose,
}: {
  request: ChangeRequestView;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const withdraw = useApiMutation('withdrawChangeRequest', {
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Withdraw ${request.reference}?`}
      description="The approver will no longer be asked to decide. The request stays in the history."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="danger"
            loading={withdraw.isPending}
            onClick={() => withdraw.mutate({ params: { id: request.id } })}
          >
            Withdraw request
          </Button>
        </>
      }
    >
      {withdraw.error ? (
        <Alert tone="danger">{errorMessage(withdraw.error)}</Alert>
      ) : (
        <p className="text-sm text-ink-muted">
          This cannot be undone; a new request can be made.
        </p>
      )}
    </Dialog>
  );
}
