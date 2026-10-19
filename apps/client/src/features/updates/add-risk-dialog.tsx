import { zodResolver } from '@hookform/resolvers/zod';
import { type CreateRiskInput, createRiskSchema } from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { InitiativePicker } from '@/components/ui/initiative-picker';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation } from '@/lib/api/query';

const SCALE = [
  { value: 1, label: '1 · Very low' },
  { value: 2, label: '2 · Low' },
  { value: 3, label: '3 · Medium' },
  { value: 4, label: '4 · High' },
  { value: 5, label: '5 · Very high' },
];

/**
 * Log a risk (may happen: rate likelihood and impact) or an issue (already
 * happening: set its severity). Given an initiative, it is logged against
 * it; otherwise the initiative is chosen in the form, and `allowPortfolio`
 * (the Strategy Office) may leave it empty for a portfolio-level item.
 */
export function AddRiskDialog({
  initiativeId,
  initiativeCode,
  allowPortfolio = false,
  onClose,
}: {
  initiativeId?: string;
  initiativeCode?: string;
  allowPortfolio?: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof createRiskSchema>, unknown, CreateRiskInput>({
    resolver: zodResolver(createRiskSchema),
    defaultValues: {
      initiativeId: initiativeId ?? null,
      type: 'RISK',
      title: '',
      likelihood: 3,
      impact: 3,
    },
  });
  const type = useWatch({ control, name: 'type' });
  const create = useApiMutation('createRisk', {
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      onClose();
    },
  });
  const [pickError, setPickError] = useState<string>();
  const onSubmit = handleSubmit((body) => {
    if (!body.initiativeId && !allowPortfolio) {
      setPickError('Choose the initiative it affects');
      return;
    }
    create.mutate({
      body:
        body.type === 'ISSUE'
          ? { ...body, likelihood: null, impact: null }
          : { ...body, severity: undefined },
    });
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        initiativeCode
          ? `Add a risk or issue to ${initiativeCode}`
          : 'Log a risk or issue'
      }
      description="A critical issue caps the initiative's status at Amber until it is resolved."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="risk-form" loading={create.isPending}>
            Add
          </Button>
        </>
      }
    >
      <form
        id="risk-form"
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
      >
        {create.error && (
          <Alert tone="danger">{errorMessage(create.error)}</Alert>
        )}
        {!initiativeId && (
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
                    ? 'Leave empty for a portfolio-level risk.'
                    : undefined
                }
                error={pickError}
              />
            )}
          />
        )}
        <Field label="Type">
          {(c) => (
            <Select {...c} {...register('type')}>
              <option value="RISK">Risk — it may happen</option>
              <option value="ISSUE">Issue — it is happening</option>
            </Select>
          )}
        </Field>
        <Field label="Title" error={errors.title?.message} required>
          {(c) => <Input {...c} {...register('title')} />}
        </Field>
        {type === 'RISK' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Likelihood"
              error={errors.likelihood?.message}
              required
            >
              {(c) => (
                <Select
                  {...c}
                  {...register('likelihood', { valueAsNumber: true })}
                >
                  {SCALE.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Impact" error={errors.impact?.message} required>
              {(c) => (
                <Select {...c} {...register('impact', { valueAsNumber: true })}>
                  {SCALE.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        ) : (
          <Field label="Severity" error={errors.severity?.message} required>
            {(c) => (
              <Select
                {...c}
                {...register('severity', {
                  setValueAs: (v: unknown) => (v === '' ? undefined : v),
                })}
              >
                <option value="">Choose…</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </Select>
            )}
          </Field>
        )}
        <Field label="Description" error={errors.description?.message}>
          {(c) => (
            <Textarea
              {...c}
              rows={2}
              {...register('description', {
                setValueAs: (v: unknown) => (v === '' ? null : v),
              })}
            />
          )}
        </Field>
        <Field
          label="Mitigation"
          hint="What is being done about it."
          error={errors.mitigation?.message}
        >
          {(c) => (
            <Textarea
              {...c}
              rows={2}
              {...register('mitigation', {
                setValueAs: (v: unknown) => (v === '' ? null : v),
              })}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
