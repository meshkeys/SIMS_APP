import type { EscalationDetail } from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { errorMessage } from '@/lib/api/errors';
import { apiKey, useApiMutation, useApiQuery } from '@/lib/api/query';
import { formatInstantDate, plural } from '@/lib/format';
import { SEVERITY_DISPLAY } from '@/lib/health';
import { deciderLabel, escalationKind } from './labels';

type Action = 'escalate' | 'deEscalate' | 'resolve' | 'withdraw';

const REASON_WORDS = {
  RAISED: 'Raised',
  CRITICAL_SEVERITY: 'Raised as critical',
  AUTO_TIMEOUT: 'Moved up automatically',
  MANUAL: 'Moved up',
  DE_ESCALATED: 'Moved down',
} as const;

/** One escalation: who decides, its history, and what the viewer may do. */
export function EscalationPanel({
  escalationId,
  ladder,
}: {
  escalationId: string;
  ladder: { level: number; name: string }[];
}) {
  const timeZone = useSession().organisation.timezone;
  const detail = useApiQuery('getEscalation', { params: { id: escalationId } });
  const [action, setAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (detail.isPending) return <Skeleton className="h-72" />;
  if (detail.isError) {
    return (
      <Card>
        <ErrorState
          error={detail.error}
          onRetry={() => void detail.refetch()}
        />
      </Card>
    );
  }

  const item = detail.data;
  const nameOf = (level: number) =>
    ladder.find((l) => l.level === level)?.name ?? `Level ${level}`;
  const severity = SEVERITY_DISPLAY[item.severity];

  return (
    <section
      aria-label={`${item.reference} · ${item.title}`}
      className="flex flex-col gap-3"
    >
      {notice && <Alert tone="success">{notice}</Alert>}
      <Card>
        <CardBody className="flex flex-col gap-5">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs text-ink-muted">
                {item.reference} · {escalationKind(item)}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-ink">
                {item.title}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                <Badge tone={severity.tone}>{severity.label}</Badge>
                {item.status === 'OPEN' ? (
                  <span>
                    L{item.level} {item.levelName} · decision needed from{' '}
                    <strong className="font-medium text-ink">
                      {deciderLabel(item)}
                    </strong>
                  </span>
                ) : (
                  <Badge
                    tone={item.status === 'RESOLVED' ? 'success' : 'neutral'}
                  >
                    {item.status === 'RESOLVED' ? 'Resolved' : 'Withdrawn'}
                  </Badge>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {item.can.escalate && (
                <Button onClick={() => setAction('escalate')}>
                  Escalate to {nameOf(item.level + 1)}
                </Button>
              )}
              {item.can.resolve && (
                <Button
                  variant="secondary"
                  onClick={() => setAction('resolve')}
                >
                  Resolve
                </Button>
              )}
              {item.can.deEscalate && (
                <Button variant="ghost" onClick={() => setAction('deEscalate')}>
                  Move down to {nameOf(item.level - 1)}
                </Button>
              )}
              {item.can.withdraw && (
                <Button variant="ghost" onClick={() => setAction('withdraw')}>
                  Withdraw
                </Button>
              )}
            </div>
          </header>

          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-ink-muted">Raised</dt>
              <dd className="text-ink">
                {plural(item.ageDays, 'day')} ago
                {item.raisedBy ? ` by ${item.raisedBy.name}` : ' automatically'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">At this level</dt>
              <dd className="text-ink">{plural(item.daysAtLevel, 'day')}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Next</dt>
              <dd className="text-ink">
                {item.status !== 'OPEN'
                  ? (item.resolution ?? '—')
                  : item.nextLevelInDays === null
                    ? 'Moves up only by decision'
                    : `Moves to ${nameOf(item.level + 1)} ${
                        item.nextLevelInDays === 0
                          ? 'today'
                          : `in ${plural(item.nextLevelInDays, 'day')}`
                      } if unresolved`}
              </dd>
            </div>
          </dl>

          {item.description && (
            <p className="text-sm whitespace-pre-line text-ink">
              {item.description}
            </p>
          )}

          <div>
            <h3 className="text-sm font-semibold text-ink">History</h3>
            <ol className="mt-2 flex flex-col gap-2 text-sm">
              {item.history.map((step, i) => (
                <li key={i} className="flex flex-wrap gap-x-2">
                  <span className="text-ink-muted">
                    {formatInstantDate(step.at, timeZone)}
                  </span>
                  <span className="text-ink">
                    {REASON_WORDS[step.reason]} to L{step.toLevel}{' '}
                    {step.toLevelName}
                    {step.actor ? ` by ${step.actor.name}` : ''}
                  </span>
                  {step.note && (
                    <span className="basis-full text-ink-muted">
                      “{step.note}”
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </CardBody>
      </Card>

      {action && (
        <ActionDialog
          item={item}
          action={action}
          target={
            action === 'escalate'
              ? nameOf(item.level + 1)
              : action === 'deEscalate'
                ? nameOf(item.level - 1)
                : null
          }
          onClose={() => setAction(null)}
          onDone={(message) => {
            setAction(null);
            setNotice(message);
          }}
        />
      )}
    </section>
  );
}

const ACTIONS = {
  escalate: { label: 'Why it needs the next level', button: 'Escalate' },
  deEscalate: {
    label: 'Why it can be handled lower down',
    button: 'Move down',
  },
  resolve: { label: 'How it was resolved', button: 'Resolve' },
  withdraw: { label: 'Why it is being withdrawn', button: 'Withdraw' },
} as const;

function ActionDialog({
  item,
  action,
  target,
  onClose,
  onDone,
}: {
  item: EscalationDetail;
  action: Action;
  target: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const config = ACTIONS[action];
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const onSuccess = {
    onSuccess: async (next: EscalationDetail) => {
      queryClient.setQueryData(
        apiKey('getEscalation', { params: { id: item.id } }),
        next,
      );
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== 'getEscalation',
      });
      onDone(
        action === 'escalate' || action === 'deEscalate'
          ? `${item.reference} moved to ${target}.`
          : action === 'resolve'
            ? `${item.reference} was resolved.`
            : `${item.reference} was withdrawn.`,
      );
    },
  };
  const mutations = {
    escalate: useApiMutation('escalateEscalation', onSuccess),
    deEscalate: useApiMutation('deEscalateEscalation', onSuccess),
    resolve: useApiMutation('resolveEscalation', onSuccess),
    withdraw: useApiMutation('withdrawEscalation', onSuccess),
  };
  const mutation = mutations[action];
  const title =
    action === 'escalate'
      ? `Escalate ${item.reference} to ${target}`
      : action === 'deEscalate'
        ? `Move ${item.reference} down to ${target}`
        : action === 'resolve'
          ? `Resolve ${item.reference}`
          : `Withdraw ${item.reference}`;

  const submit = () => {
    if (text.trim().length < 10) {
      setError('Write at least 10 characters');
      return;
    }
    const params = { id: item.id };
    const value = text.trim();
    if (action === 'escalate')
      mutations.escalate.mutate({ params, body: { note: value } });
    else if (action === 'deEscalate')
      mutations.deEscalate.mutate({ params, body: { note: value } });
    else if (action === 'resolve')
      mutations.resolve.mutate({ params, body: { resolution: value } });
    else mutations.withdraw.mutate({ params, body: { reason: value } });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description={item.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="escalation-action"
            loading={mutation.isPending}
          >
            {config.button}
          </Button>
        </>
      }
    >
      <form
        id="escalation-action"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {mutation.error && (
          <Alert tone="danger">{errorMessage(mutation.error)}</Alert>
        )}
        <Field label={config.label} error={error} required>
          {(c) => (
            <Textarea
              {...c}
              rows={3}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(undefined);
              }}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
