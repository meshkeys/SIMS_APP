import { zodResolver } from '@hookform/resolvers/zod';
import {
  type DecideInput,
  decideSchema,
  type DecisionView,
  ROLE_LABELS,
} from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';
import { EmptyState } from '@/components/ui/states';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { formatDayMonth, plural } from '@/lib/format';

/** "Decisions required": the most urgent open decisions, decidable in place. */
export function DecisionsPanel({
  decisions,
}: {
  decisions: { items: DecisionView[]; total: number };
}) {
  const [reviewing, setReviewing] = useState<DecisionView | null>(null);
  return (
    <Card aria-labelledby="decisions-title">
      <CardHeader
        titleId="decisions-title"
        title="Decisions required"
        action={<span className="text-ink-muted">{decisions.total} open</span>}
      />
      <CardBody className="pt-3">
        {decisions.items.length === 0 ? (
          <EmptyState title="No decisions waiting" />
        ) : (
          <ul className="flex flex-col gap-3">
            {decisions.items.map((decision) => (
              <li
                key={decision.id}
                className="rounded-md border border-border p-4"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-ink-muted">
                    {decision.reference}
                  </span>
                  <DueLabel decision={decision} />
                </div>
                <p className="mt-2 font-medium text-ink">{decision.title}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Decision owner: {ownerLabel(decision)}
                </p>
                {decision.canDecide ? (
                  <Button
                    className="mt-3 w-full"
                    onClick={() => setReviewing(decision)}
                    aria-label={`Review ${decision.reference}`}
                  >
                    Review
                  </Button>
                ) : (
                  <p className="mt-3 text-xs text-ink-subtle">
                    Waiting for {ownerLabel(decision)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      {reviewing && (
        <DecideDialog decision={reviewing} onClose={() => setReviewing(null)} />
      )}
    </Card>
  );
}

function ownerLabel(decision: DecisionView): string {
  const role = ROLE_LABELS[decision.requiredFrom];
  return decision.decisionOwner
    ? `${decision.decisionOwner.name} (${role})`
    : role;
}

function DueLabel({ decision }: { decision: DecisionView }) {
  if (decision.overdueDays > 0) {
    return (
      <span className="font-medium text-danger">
        {plural(decision.overdueDays, 'day')} overdue
      </span>
    );
  }
  if (!decision.dueDate) return null;
  return (
    <span className="font-medium text-impact-text">
      Due {formatDayMonth(decision.dueDate)}
    </span>
  );
}

const OUTCOMES = [
  { value: 'APPROVED', label: 'Approve' },
  { value: 'REJECTED', label: 'Reject' },
  { value: 'DEFERRED', label: 'Defer' },
] as const;

function DecideDialog({
  decision,
  onClose,
}: {
  decision: DecisionView;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<z.input<typeof decideSchema>, unknown, DecideInput>({
    resolver: zodResolver(decideSchema),
    defaultValues: { outcome: 'APPROVED', notes: '' },
  });
  const outcome = useWatch({ control, name: 'outcome' });
  const decide = useApiMutation('decide', {
    onSuccess: async () => {
      // Decisions feed the dashboard, the register and initiative pages.
      await queryClient.invalidateQueries();
      onClose();
    },
  });

  const onSubmit = handleSubmit((input) =>
    decide.mutate({ params: { id: decision.id }, body: input }),
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${decision.reference} · ${decision.title}`}
      description={
        decision.kind === 'CHANGE_REQUEST'
          ? 'Approving applies the change to the baseline.'
          : decision.kind === 'RULE_CHANGE'
            ? 'Approving puts these rules in force at once and recalculates every status and KPI trajectory.'
            : decision.initiative
              ? `${decision.initiative.code} · ${decision.initiative.title}`
              : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="decide-form" loading={decide.isPending}>
            Record decision
          </Button>
        </>
      }
    >
      <form
        id="decide-form"
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
      >
        {decision.context && (
          <p className="text-sm whitespace-pre-line text-ink-muted">
            {decision.context}
          </p>
        )}
        {decide.error && (
          <Alert tone="danger">{errorMessage(decide.error)}</Alert>
        )}
        <fieldset>
          <legend className="text-sm font-medium text-ink">Decision</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {OUTCOMES.map((option) => (
              <label
                key={option.value}
                className={cn(
                  'flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary',
                  outcome === option.value
                    ? 'border-primary bg-primary-soft font-medium text-primary'
                    : 'border-border-strong text-ink',
                )}
              >
                <input
                  type="radio"
                  value={option.value}
                  className="sr-only"
                  {...register('outcome')}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field
          label="Notes"
          hint={
            outcome === 'APPROVED'
              ? 'Optional'
              : 'Say why — the requester and the decision log will see this.'
          }
          error={errors.notes?.message}
          required={outcome !== 'APPROVED'}
        >
          {(controlProps) => (
            <Textarea {...controlProps} rows={3} {...register('notes')} />
          )}
        </Field>
        {outcome === 'DEFERRED' && (
          <Field
            label="Revisit on"
            error={errors.deferredUntil?.message}
            required
          >
            {(controlProps) => (
              <Input
                type="date"
                {...controlProps}
                {...register('deferredUntil')}
              />
            )}
          </Field>
        )}
      </form>
    </Dialog>
  );
}
