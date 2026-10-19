import { zodResolver } from '@hookform/resolvers/zod';
import {
  type EscalationDetail,
  type RaiseEscalationInput,
  raiseEscalationSchema,
  type RiskView,
} from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { InitiativePicker } from '@/components/ui/initiative-picker';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation } from '@/lib/api/query';

/**
 * Raise an escalation: for an initiative, for a logged risk (its initiative
 * is used), or, for the Strategy Office, for the whole portfolio. Critical
 * items start at the level the organisation's rules send them to.
 */
export function RaiseEscalationDialog({
  risk,
  allowPortfolio,
  onClose,
  onRaised,
}: {
  /** Escalating a logged risk or issue. */
  risk?: RiskView;
  allowPortfolio: boolean;
  onClose: () => void;
  onRaised: (escalation: EscalationDetail) => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<
    z.input<typeof raiseEscalationSchema>,
    unknown,
    RaiseEscalationInput
  >({
    resolver: zodResolver(raiseEscalationSchema),
    defaultValues: {
      title: risk?.title ?? '',
      severity: risk?.severity ?? 'HIGH',
      riskIssueId: risk?.id ?? null,
      initiativeId: null,
      source: 'MANUAL',
      description: null,
    },
  });
  const [pickError, setPickError] = useState<string>();
  const raise = useApiMutation('raiseEscalation', {
    onSuccess: async (escalation) => {
      await queryClient.invalidateQueries();
      onRaised(escalation);
    },
  });
  const onSubmit = handleSubmit((body) => {
    if (!risk && !body.initiativeId && !allowPortfolio) {
      setPickError('Choose the initiative it affects');
      return;
    }
    raise.mutate({ body });
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={risk ? 'Escalate a risk' : 'Raise an escalation'}
      description={
        risk
          ? `${risk.initiative?.code ?? 'Portfolio'} · ${risk.title}`
          : 'Something is preventing execution and needs a decision above the initiative.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="raise-form" loading={raise.isPending}>
            Raise escalation
          </Button>
        </>
      }
    >
      <form
        id="raise-form"
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
      >
        {raise.error && (
          <Alert tone="danger">{errorMessage(raise.error)}</Alert>
        )}
        {!risk && (
          <Controller
            control={control}
            name="initiativeId"
            render={({ field }) => (
              <InitiativePicker
                label="Initiative"
                value={field.value ?? null}
                onChange={(id) => {
                  setPickError(undefined);
                  field.onChange(id);
                }}
                required={!allowPortfolio}
                hint={
                  allowPortfolio
                    ? 'Leave empty for a problem across the portfolio.'
                    : undefined
                }
                error={pickError}
              />
            )}
          />
        )}
        <Field
          label="What is blocking execution"
          error={errors.title?.message}
          required
        >
          {(c) => <Input {...c} {...register('title')} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Severity"
            hint="Critical items go straight to the MD/CEO level."
            error={errors.severity?.message}
            required
          >
            {(c) => (
              <Select {...c} {...register('severity')}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </Select>
            )}
          </Field>
          {!risk && (
            <Field label="Kind" error={errors.source?.message}>
              {(c) => (
                <Select {...c} {...register('source')}>
                  <option value="MANUAL">Problem needing a decision</option>
                  <option value="RESOURCE_CONFLICT">Resource conflict</option>
                </Select>
              )}
            </Field>
          )}
        </div>
        <Field
          label="Details"
          hint="What has been tried, and what decision is needed."
          error={errors.description?.message}
        >
          {(c) => (
            <Textarea
              {...c}
              rows={3}
              {...register('description', {
                setValueAs: (v: unknown) => (v === '' ? null : v),
              })}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
