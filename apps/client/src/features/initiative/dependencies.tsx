import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateDependencyInput,
  createDependencySchema,
  DependencyStatus,
  type InitiativeDetail,
} from '@sims/contracts';
import { Link } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { InitiativePicker } from '@/components/ui/initiative-picker';
import { EmptyState } from '@/components/ui/states';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { useApplyDetail } from './use-apply-detail';

type Dependency = InitiativeDetail['dependencies']['blockedBy'][number];

const STATUS_WORDS: Record<DependencyStatus, string> = {
  ON_TRACK: 'On track',
  AT_RISK: 'At risk',
  BLOCKED: 'Blocked',
  RESOLVED: 'Resolved',
};

/**
 * What this initiative waits on (with status, need-by date and actions for
 * the people working on it), and what waits on it.
 */
export function DependencyList({
  initiative,
}: {
  initiative: InitiativeDetail;
}) {
  const { blockedBy, enables } = initiative.dependencies;
  if (blockedBy.length + enables.length === 0) {
    return <EmptyState className="py-6" title="No dependencies" />;
  }
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {blockedBy.map((d) => (
        <WaitsOn key={d.id} initiative={initiative} dependency={d} />
      ))}
      {enables.map((d) => (
        <li key={d.id} className="rounded-md bg-surface-muted px-3 py-2">
          <span className="mr-2 text-xs font-medium text-ink-muted">
            Enables
          </span>
          <Link
            to="/initiatives/$id"
            params={{ id: d.initiativeId }}
            className="text-ink hover:underline"
          >
            <span className="font-mono text-xs">{d.code}</span> {d.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function WaitsOn({
  initiative,
  dependency: d,
}: {
  initiative: InitiativeDetail;
  dependency: Dependency;
}) {
  const apply = useApplyDetail(initiative.id);
  const update = useApiMutation('updateDependency', { onSuccess: apply });
  const remove = useApiMutation('deleteDependency', { onSuccess: apply });
  const blocked = d.status === 'BLOCKED';
  const error = update.error ?? remove.error;

  return (
    <li
      className={cn(
        'rounded-md px-3 py-2',
        blocked ? 'bg-danger-soft' : 'bg-surface-muted',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span
            className={cn(
              'mr-2 text-xs font-medium',
              blocked ? 'text-danger' : 'text-ink-muted',
            )}
          >
            {blocked ? 'Blocked by' : 'Depends on'}
          </span>
          <Link
            to="/initiatives/$id"
            params={{ id: d.initiativeId }}
            className="text-ink hover:underline"
          >
            <span className="font-mono text-xs">{d.code}</span> {d.title}
          </Link>
          {d.isCriticalPath && (
            <span className="ml-2 text-xs text-ink-muted">critical path</span>
          )}
          {d.description && (
            <span className="block text-xs text-ink-muted">
              {d.description}
            </span>
          )}
          <span className="block text-xs text-ink-muted">
            {d.neededBy && `Needed by ${formatDate(d.neededBy)}`}
            {d.neededBy && d.blockedSince && ' · '}
            {d.blockedSince && (
              <span className="text-danger">
                blocked since {formatDate(d.blockedSince)}
              </span>
            )}
          </span>
        </div>
        {initiative.can.manageWork && (
          <span className="flex shrink-0 items-center gap-1">
            <Select
              aria-label={`Status of dependency on ${d.code}`}
              value={d.status}
              disabled={update.isPending}
              onChange={(event) =>
                update.mutate({
                  params: { id: d.id },
                  body: { status: event.target.value as DependencyStatus },
                })
              }
              className="h-8 w-auto bg-surface"
            >
              {Object.values(DependencyStatus).map((s) => (
                <option key={s} value={s}>
                  {STATUS_WORDS[s]}
                </option>
              ))}
            </Select>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove dependency on ${d.code}`}
              loading={remove.isPending}
              onClick={() => remove.mutate({ params: { id: d.id } })}
            >
              {!remove.isPending && <Trash2 />}
            </Button>
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {errorMessage(error)}
        </p>
      )}
    </li>
  );
}

/** Record that this initiative waits on another one. */
export function AddDependencyDialog({
  initiative,
  onClose,
}: {
  initiative: InitiativeDetail;
  onClose: () => void;
}) {
  const apply = useApplyDetail(initiative.id);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<
    z.input<typeof createDependencySchema>,
    unknown,
    CreateDependencyInput
  >({
    resolver: zodResolver(createDependencySchema),
    defaultValues: {
      toInitiativeId: '',
      isCriticalPath: false,
      status: 'ON_TRACK',
    },
  });
  const add = useApiMutation('addDependency', {
    onSuccess: async (detail) => {
      await apply(detail);
      onClose();
    },
  });
  const onSubmit = handleSubmit((body) =>
    add.mutate({ params: { id: initiative.id }, body }),
  );
  // Already linked, or itself: not offered again.
  const exclude = [
    initiative.id,
    ...initiative.dependencies.blockedBy.map((d) => d.initiativeId),
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`What ${initiative.code} waits on`}
      description="A blocked dependency on the critical path turns the initiative Red until it is resolved."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="dependency-form" loading={add.isPending}>
            Add dependency
          </Button>
        </>
      }
    >
      <form
        id="dependency-form"
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
      >
        {add.error && <Alert tone="danger">{errorMessage(add.error)}</Alert>}
        <Controller
          control={control}
          name="toInitiativeId"
          render={({ field, fieldState }) => (
            <InitiativePicker
              label="Waits on"
              required
              value={field.value || null}
              onChange={(id) => field.onChange(id ?? '')}
              exclude={exclude}
              error={
                fieldState.error
                  ? 'Choose the initiative it waits on'
                  : undefined
              }
            />
          )}
        />
        <Field label="What is needed" error={errors.description?.message}>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Needed by" error={errors.neededBy?.message}>
            {(c) => (
              <Input
                {...c}
                type="date"
                {...register('neededBy', {
                  setValueAs: (v: unknown) => (v === '' ? null : v),
                })}
              />
            )}
          </Field>
          <Field label="Status now" error={errors.status?.message}>
            {(c) => (
              <Select {...c} {...register('status')}>
                {(['ON_TRACK', 'AT_RISK', 'BLOCKED'] as const).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_WORDS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            {...register('isCriticalPath')}
          />
          <span>
            <span className="font-medium text-ink">On the critical path</span>
            <span className="block text-ink-muted">
              Delivery cannot finish on time without it.
            </span>
          </span>
        </label>
      </form>
    </Dialog>
  );
}

export function DependenciesCard({
  initiative,
  onAdd,
}: {
  initiative: InitiativeDetail;
  onAdd: () => void;
}) {
  return (
    <Card aria-labelledby="dependencies-title">
      <CardHeader
        titleId="dependencies-title"
        title="Dependencies"
        action={
          initiative.can.manageWork ? (
            <Button variant="secondary" size="sm" onClick={onAdd}>
              Add dependency
            </Button>
          ) : undefined
        }
      />
      <CardBody className="pt-3">
        <DependencyList initiative={initiative} />
      </CardBody>
    </Card>
  );
}
