import { zodResolver } from '@hookform/resolvers/zod';
import {
  type InitiativeDetail,
  type InitiativeStatus,
  type OverrideInput,
  overrideSchema,
  STATUS_CHANGES_NEEDING_REASON,
} from '@sims/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation } from '@/lib/api/query';
import { HEALTH_DISPLAY } from '@/lib/health';
import { moveLabel } from './labels';
import { useApplyDetail } from './use-apply-detail';

const CONSEQUENCES: Partial<Record<InitiativeStatus, string>> = {
  APPROVED: 'It can then be planned in detail and activated.',
  ACTIVE:
    'Its baseline locks: later changes need an approved change request. Monthly reporting starts.',
  ON_HOLD:
    'Reporting pauses and it stops counting towards pillar scores until it resumes.',
  CLOSED: 'Delivery ends; benefits continue to be tracked.',
  CANCELLED: 'This is final. History is kept for audit.',
  DRAFT: 'It goes back to its proposer for rework.',
};

/** Confirm a lifecycle move; stopping or pausing delivery needs a reason. */
export function StatusDialog({
  initiative,
  to,
  onClose,
}: {
  initiative: InitiativeDetail;
  to: InitiativeStatus;
  onClose: () => void;
}) {
  const needsReason = (
    STATUS_CHANGES_NEEDING_REASON as readonly string[]
  ).includes(to);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const apply = useApplyDetail(initiative.id);
  const move = useApiMutation('changeInitiativeStatus', {
    onSuccess: async (detail) => {
      await apply(detail);
      onClose();
    },
  });
  const label = moveLabel(initiative.status, to);

  const submit = () => {
    const trimmed = reason.trim();
    if (needsReason && trimmed.length < 10) {
      setError('Explain the change in at least 10 characters');
      return;
    }
    setError(null);
    move.mutate({
      params: { id: initiative.id },
      body: { status: to, reason: trimmed || undefined },
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${label}: ${initiative.code}`}
      description={CONSEQUENCES[to]}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep as is
          </Button>
          <Button
            variant={to === 'CANCELLED' ? 'danger' : 'primary'}
            loading={move.isPending}
            onClick={submit}
          >
            {label}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {move.error && <Alert tone="danger">{errorMessage(move.error)}</Alert>}
        <Field
          label="Reason"
          hint={
            needsReason
              ? 'Required — it is recorded in the audit trail.'
              : 'Optional — recorded in the audit trail.'
          }
          error={error ?? undefined}
          required={needsReason}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/** Override the calculated health, with a reason and an expiry. */
export function OverrideDialog({
  initiative,
  onClose,
}: {
  initiative: InitiativeDetail;
  onClose: () => void;
}) {
  const apply = useApplyDetail(initiative.id);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof overrideSchema>, unknown, OverrideInput>({
    resolver: zodResolver(overrideSchema),
    defaultValues: {
      health: initiative.health.calculated === 'RED' ? 'AMBER' : 'GREEN',
      reason: '',
    },
  });
  const override = useApiMutation('setHealthOverride', {
    onSuccess: async (detail) => {
      await apply(detail);
      onClose();
    },
  });
  const onSubmit = handleSubmit((body) =>
    override.mutate({ params: { id: initiative.id }, body }),
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Override health: ${initiative.code}`}
      description={`Calculated as ${HEALTH_DISPLAY[initiative.health.calculated].label}. An override is shown instead until it expires, and is logged in the audit trail.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="override-form"
            loading={override.isPending}
          >
            Override
          </Button>
        </>
      }
    >
      <form
        id="override-form"
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
      >
        {override.error && (
          <Alert tone="danger">{errorMessage(override.error)}</Alert>
        )}
        <Field label="Show as" error={errors.health?.message} required>
          {(control) => (
            <Select {...control} {...register('health')}>
              {(['GREEN', 'AMBER', 'RED'] as const).map((h) => (
                <option key={h} value={h}>
                  {HEALTH_DISPLAY[h].label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Reason"
          hint="What the calculation does not know, e.g. a signed contract not yet reflected."
          error={errors.reason?.message}
          required
        >
          {(control) => (
            <Textarea {...control} rows={3} {...register('reason')} />
          )}
        </Field>
        <Field
          label="Expires on"
          hint="Leave empty for the longest your organisation allows."
          error={errors.expiresAt?.message}
        >
          {(control) => (
            <Input
              {...control}
              type="date"
              className="w-48"
              {...register('expiresAt', {
                setValueAs: (v: unknown) => (v === '' ? undefined : v),
              })}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}

/** Remove a manual override, going back to the calculated status. */
export function ClearOverrideDialog({
  initiative,
  onClose,
}: {
  initiative: InitiativeDetail;
  onClose: () => void;
}) {
  const apply = useApplyDetail(initiative.id);
  const clear = useApiMutation('clearHealthOverride', {
    onSuccess: async (detail) => {
      await apply(detail);
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Remove the override?"
      description={`${initiative.code} will show its calculated status, ${HEALTH_DISPLAY[initiative.health.calculated].label}, again.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep override
          </Button>
          <Button
            loading={clear.isPending}
            onClick={() => clear.mutate({ params: { id: initiative.id } })}
          >
            Remove override
          </Button>
        </>
      }
    >
      {clear.error ? (
        <Alert tone="danger">{errorMessage(clear.error)}</Alert>
      ) : (
        <p className="text-sm text-ink-muted">
          The removal is logged in the audit trail.
        </p>
      )}
    </Dialog>
  );
}
