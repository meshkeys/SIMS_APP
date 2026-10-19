import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateMilestoneInput,
  createMilestoneSchema,
  type InitiativeDetail,
  type InitiativeField,
  type ObjectivesInput,
  objectivesSchema,
  type UpdateInitiativeInput,
  updateInitiativeSchema,
} from '@sims/contracts';
import {
  Controller,
  type FieldPath,
  FormProvider,
  useForm,
} from 'react-hook-form';
import type { z } from 'zod';
import { useSession } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { PeoplePicker } from '@/components/ui/people-picker';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation, useApiQuery } from '@/lib/api/query';
import { ObjectivesEditor } from '../initiatives/objectives-editor';
import { useApplyDetail } from './use-apply-detail';

const blankToNull = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : v;
const numberOrNull = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : Number(v);

type DetailsInput = z.input<typeof updateInitiativeSchema>;

/**
 * Edit an initiative's details. Only the fields this person may change now
 * are shown (from the server's `can.editFields`), and only what was actually
 * changed is sent.
 */
export function EditDetailsDialog({
  initiative,
  onClose,
}: {
  initiative: InitiativeDetail;
  onClose: () => void;
}) {
  const { organisation } = useSession();
  const departments = useApiQuery('listDepartments', {});
  const apply = useApplyDetail(initiative.id);
  const may = (field: InitiativeField) =>
    initiative.can.editFields.includes(field);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, dirtyFields },
  } = useForm<DetailsInput, unknown, UpdateInitiativeInput>({
    resolver: zodResolver(updateInitiativeSchema),
    defaultValues: {
      title: initiative.title,
      description: initiative.description,
      businessCase: initiative.businessCase,
      scope: initiative.scope,
      ownerId: initiative.owner?.membershipId ?? null,
      sponsorId: initiative.sponsor?.membershipId ?? null,
      benefitsOwnerId: initiative.benefitsOwner?.membershipId ?? null,
      departmentId: initiative.department?.id ?? null,
      priority: initiative.priority,
      isSensitive: initiative.isSensitive,
      baselineStart: initiative.baseline.start,
      baselineEnd: initiative.baseline.end,
      baselineBudget: initiative.budget.baseline,
      forecastEnd: initiative.forecastEnd,
      spentToDate: initiative.budget.spent,
    },
  });

  const save = useApiMutation('updateInitiative', {
    onSuccess: async (detail) => {
      await apply(detail);
      onClose();
    },
    onError: (error) => {
      for (const [path, message] of Object.entries(error.fieldErrors)) {
        setError(path as FieldPath<DetailsInput>, { message });
      }
    },
  });

  const onSubmit = handleSubmit((values) => {
    const changed = Object.fromEntries(
      Object.entries(values).filter(
        ([key]) => dirtyFields[key as keyof DetailsInput],
      ),
    );
    if (Object.keys(changed).length === 0) {
      onClose();
      return;
    }
    save.mutate({ params: { id: initiative.id }, body: changed });
  });

  const formError =
    save.error && Object.keys(save.error.fieldErrors).length === 0
      ? errorMessage(save.error)
      : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Edit ${initiative.code}`}
      description={
        initiative.can.editFields.some((f) => f.startsWith('baseline'))
          ? undefined
          : 'The baseline (dates and budget) is locked; changes to it go through a change request.'
      }
      className="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-details-form"
            loading={save.isPending}
          >
            Save changes
          </Button>
        </>
      }
    >
      <form
        id="edit-details-form"
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
      >
        {formError && <Alert tone="danger">{formError}</Alert>}
        {may('title') && (
          <Field label="Title" error={errors.title?.message} required>
            {(c) => <Input {...c} {...register('title')} />}
          </Field>
        )}
        {may('description') && (
          <Field label="Description" error={errors.description?.message}>
            {(c) => (
              <Textarea
                {...c}
                rows={3}
                {...register('description', { setValueAs: blankToNull })}
              />
            )}
          </Field>
        )}
        {may('businessCase') && (
          <Field label="Business case" error={errors.businessCase?.message}>
            {(c) => (
              <Textarea
                {...c}
                rows={3}
                {...register('businessCase', { setValueAs: blankToNull })}
              />
            )}
          </Field>
        )}
        {may('scope') && (
          <Field label="Scope" error={errors.scope?.message}>
            {(c) => (
              <Textarea
                {...c}
                rows={2}
                {...register('scope', { setValueAs: blankToNull })}
              />
            )}
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {may('ownerId') && (
            <Controller
              control={control}
              name="ownerId"
              render={({ field, fieldState }) => (
                <PeoplePicker
                  label="Owner"
                  value={field.value ?? null}
                  initialPerson={initiative.owner}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
          )}
          {may('sponsorId') && (
            <Controller
              control={control}
              name="sponsorId"
              render={({ field, fieldState }) => (
                <PeoplePicker
                  label="Executive sponsor"
                  onlyRole="EXECUTIVE_SPONSOR"
                  value={field.value ?? null}
                  initialPerson={initiative.sponsor}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
          )}
          {may('benefitsOwnerId') && (
            <Controller
              control={control}
              name="benefitsOwnerId"
              render={({ field, fieldState }) => (
                <PeoplePicker
                  label="Benefits owner"
                  value={field.value ?? null}
                  initialPerson={initiative.benefitsOwner}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
          )}
          {may('departmentId') && (
            <Field label="Department" error={errors.departmentId?.message}>
              {(c) => (
                <Select
                  {...c}
                  {...register('departmentId', { setValueAs: blankToNull })}
                >
                  <option value="">None</option>
                  {(departments.data ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {may('priority') && (
            <Field
              label="Priority"
              hint="1 is the highest."
              error={errors.priority?.message}
            >
              {(c) => (
                <Select
                  {...c}
                  {...register('priority', { valueAsNumber: true })}
                >
                  {[1, 2, 3, 4, 5].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>

        {(may('baselineStart') ||
          may('baselineEnd') ||
          may('baselineBudget')) && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Baseline start" error={errors.baselineStart?.message}>
              {(c) => (
                <Input
                  {...c}
                  type="date"
                  {...register('baselineStart', { setValueAs: blankToNull })}
                />
              )}
            </Field>
            <Field label="Baseline end" error={errors.baselineEnd?.message}>
              {(c) => (
                <Input
                  {...c}
                  type="date"
                  {...register('baselineEnd', { setValueAs: blankToNull })}
                />
              )}
            </Field>
            <Field
              label={`Budget (${organisation.currency})`}
              error={errors.baselineBudget?.message}
            >
              {(c) => (
                <Input
                  {...c}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  {...register('baselineBudget', { setValueAs: numberOrNull })}
                />
              )}
            </Field>
          </div>
        )}

        {(may('forecastEnd') || may('spentToDate')) && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Forecast end"
              hint="When you now expect to finish."
              error={errors.forecastEnd?.message}
            >
              {(c) => (
                <Input
                  {...c}
                  type="date"
                  {...register('forecastEnd', { setValueAs: blankToNull })}
                />
              )}
            </Field>
            <Field
              label={`Spent to date (${organisation.currency})`}
              error={errors.spentToDate?.message}
            >
              {(c) => (
                <Input
                  {...c}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  {...register('spentToDate', { setValueAs: numberOrNull })}
                />
              )}
            </Field>
          </div>
        )}

        {may('isSensitive') && (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              {...register('isSensitive')}
            />
            <span>
              <span className="font-medium text-ink">Restricted</span>
              <span className="block text-ink-muted">
                Only the Strategy Office, its owner, sponsor and benefits owner
                can see it.
              </span>
            </span>
          </label>
        )}
      </form>
    </Dialog>
  );
}

/** Relink the objectives an initiative delivers (Strategy Office). */
export function EditObjectivesDialog({
  initiative,
  onClose,
}: {
  initiative: InitiativeDetail;
  onClose: () => void;
}) {
  const map = useApiQuery('getCurrentStrategyMap', {});
  const apply = useApplyDetail(initiative.id);
  const methods = useForm<
    z.input<typeof objectivesSchema>,
    unknown,
    ObjectivesInput
  >({
    resolver: zodResolver(objectivesSchema),
    defaultValues: {
      objectives: initiative.contributesTo.map((c) => ({
        elementId: c.elementId,
        weight: c.weight,
        isPrimary: c.isPrimary,
      })),
    },
  });
  const save = useApiMutation('replaceObjectives', {
    onSuccess: async (detail) => {
      await apply(detail);
      onClose();
    },
  });
  const onSubmit = methods.handleSubmit((body) =>
    save.mutate({ params: { id: initiative.id }, body }),
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`What ${initiative.code} delivers`}
      description="The primary objective decides its pillar. Pillar and objective scores are recalculated."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="objectives-form"
            loading={save.isPending}
            disabled={!map.data}
          >
            Save
          </Button>
        </>
      }
    >
      <FormProvider {...methods}>
        <form
          id="objectives-form"
          noValidate
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
        >
          {save.error && (
            <Alert tone="danger">{errorMessage(save.error)}</Alert>
          )}
          {map.data ? (
            <ObjectivesEditor
              elements={map.data.elements}
              levelLabels={map.data.levels.map((l) => l.label)}
            />
          ) : (
            <p className="text-sm text-ink-muted">Loading the strategy map…</p>
          )}
        </form>
      </FormProvider>
    </Dialog>
  );
}

type Milestone = InitiativeDetail['milestones'][number];
type MilestoneInput = z.input<typeof createMilestoneSchema>;

/**
 * Add a milestone, or edit one. After activation the plan (weight, baseline
 * dates, critical, evidence) is locked; the title and forecast stay open.
 */
export function MilestoneDialog({
  initiative,
  milestone,
  onClose,
}: {
  initiative: InitiativeDetail;
  /** Omit to add a new milestone. */
  milestone?: Milestone;
  onClose: () => void;
}) {
  const apply = useApplyDetail(initiative.id);
  const plan = initiative.can.planMilestones;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, dirtyFields },
  } = useForm<MilestoneInput, unknown, CreateMilestoneInput>({
    resolver: zodResolver(createMilestoneSchema),
    defaultValues: milestone
      ? {
          title: milestone.title,
          weight: milestone.weight,
          isCritical: milestone.isCritical,
          baselineStartDate: milestone.baselineStartDate,
          baselineDate: milestone.baselineDate,
          forecastDate: milestone.forecastDate,
        }
      : {
          title: '',
          weight: 10,
          isCritical: false,
          evidenceRequired: true,
          baselineDate: '',
        },
  });
  const onDone = {
    onSuccess: async (detail: InitiativeDetail) => {
      await apply(detail);
      onClose();
    },
    onError: (error: { fieldErrors: Record<string, string> }) => {
      for (const [path, message] of Object.entries(error.fieldErrors)) {
        setError(path as FieldPath<MilestoneInput>, { message });
      }
    },
  };
  const add = useApiMutation('addMilestone', onDone);
  const update = useApiMutation('updateMilestone', onDone);
  const mutation = milestone ? update : add;

  const onSubmit = handleSubmit((values) => {
    if (!milestone) {
      add.mutate({ params: { id: initiative.id }, body: values });
      return;
    }
    const changed = Object.fromEntries(
      Object.entries(values).filter(
        ([key]) => dirtyFields[key as keyof MilestoneInput],
      ),
    );
    if (Object.keys(changed).length === 0) return onClose();
    update.mutate({ params: { id: milestone.id }, body: changed });
  });

  const formError =
    mutation.error && Object.keys(mutation.error.fieldErrors).length === 0
      ? errorMessage(mutation.error)
      : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        milestone ? `Edit milestone` : `Add a milestone to ${initiative.code}`
      }
      description={
        plan
          ? 'Weights set how much each milestone counts towards completion.'
          : 'The milestone plan is locked: only the title and forecast can change here.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="milestone-form"
            loading={mutation.isPending}
          >
            {milestone ? 'Save' : 'Add milestone'}
          </Button>
        </>
      }
    >
      <form
        id="milestone-form"
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
      >
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Title" error={errors.title?.message} required>
          {(c) => <Input {...c} {...register('title')} />}
        </Field>
        {plan && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Weight %" error={errors.weight?.message} required>
              {(c) => (
                <Input
                  {...c}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  {...register('weight', { valueAsNumber: true })}
                />
              )}
            </Field>
            <Field label="Starts" error={errors.baselineStartDate?.message}>
              {(c) => (
                <Input
                  {...c}
                  type="date"
                  {...register('baselineStartDate', {
                    setValueAs: blankToNull,
                  })}
                />
              )}
            </Field>
            <Field label="Due" error={errors.baselineDate?.message} required>
              {(c) => (
                <Input {...c} type="date" {...register('baselineDate')} />
              )}
            </Field>
          </div>
        )}
        {milestone && (
          <Field
            label="Forecast date"
            hint="When it is now expected; leave empty if on its due date."
            error={errors.forecastDate?.message}
          >
            {(c) => (
              <Input
                {...c}
                type="date"
                className="w-48"
                {...register('forecastDate', { setValueAs: blankToNull })}
              />
            )}
          </Field>
        )}
        {plan && (
          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                {...register('isCritical')}
              />
              <span>
                <span className="font-medium text-ink">Critical</span>
                <span className="block text-ink-muted">
                  If it runs late, the initiative shows as Delayed.
                </span>
              </span>
            </label>
            {!milestone && (
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  {...register('evidenceRequired')}
                />
                <span>
                  <span className="font-medium text-ink">
                    Evidence required
                  </span>
                  <span className="block text-ink-muted">
                    Progress claims need a supporting file.
                  </span>
                </span>
              </label>
            )}
          </div>
        )}
      </form>
    </Dialog>
  );
}

/** Remove a milestone (only while the plan is still open). */
export function DeleteMilestoneDialog({
  initiative,
  milestone,
  onClose,
}: {
  initiative: InitiativeDetail;
  milestone: Milestone;
  onClose: () => void;
}) {
  const apply = useApplyDetail(initiative.id);
  const remove = useApiMutation('deleteMilestone', {
    onSuccess: async (detail) => {
      await apply(detail);
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Remove this milestone?"
      description={`“${milestone.title}” and its tasks will be removed from ${initiative.code}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => remove.mutate({ params: { id: milestone.id } })}
          >
            Remove milestone
          </Button>
        </>
      }
    >
      {remove.error ? (
        <Alert tone="danger">{errorMessage(remove.error)}</Alert>
      ) : (
        <p className="text-sm text-ink-muted">
          The removal is recorded in the audit trail.
        </p>
      )}
    </Dialog>
  );
}
