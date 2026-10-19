import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateInitiativeInput,
  createInitiativeSchema,
  type MapElement,
} from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import {
  Controller,
  type FieldPath,
  useFieldArray,
  useForm,
  useWatch,
} from 'react-hook-form';
import type { z } from 'zod';
import { useSession } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/page-header';
import { PeoplePicker } from '@/components/ui/people-picker';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation, useApiQuery } from '@/lib/api/query';

type FormInput = z.input<typeof createInitiativeSchema>;

/** Blank optional inputs mean "not given". */
const blankToUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;
const blankToNull = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : v;
const numberOrNull = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : Number(v);

/** "Propose initiative": everything the Strategy Office needs to approve it. */
export function ProposePage() {
  const session = useSession();
  const map = useApiQuery('getCurrentStrategyMap', {});
  const departments = useApiQuery('listDepartments', {});
  const isOffice = session.membership.roles.some(
    (r) => r === 'STRATEGY_OFFICE' || r === 'SYSTEM_ADMIN',
  );

  if (map.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <output className="sr-only">Loading…</output>
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (map.isError) {
    return <ErrorState error={map.error} onRetry={() => void map.refetch()} />;
  }
  return (
    <ProposeForm
      elements={map.data.elements}
      levelLabels={map.data.levels.map((l) => l.label)}
      departments={departments.data ?? []}
      isOffice={isOffice}
      currency={session.organisation.currency}
    />
  );
}

function ProposeForm({
  elements,
  levelLabels,
  departments,
  isOffice,
  currency,
}: {
  elements: MapElement[];
  levelLabels: string[];
  departments: { id: string; name: string }[];
  isOffice: boolean;
  currency: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'PROPOSED' | 'DRAFT'>('PROPOSED');

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors },
  } = useForm<FormInput, unknown, CreateInitiativeInput>({
    resolver: zodResolver(createInitiativeSchema),
    defaultValues: {
      title: '',
      objectives: [{ elementId: '', weight: 100, isPrimary: true }],
      ownerId: null,
      sponsorId: null,
      benefitsOwnerId: null,
      departmentId: null,
      priority: 2,
      isSensitive: false,
      baselineStart: null,
      baselineEnd: null,
      baselineBudget: null,
    },
  });
  const objectives = useFieldArray({ control, name: 'objectives' });
  const links = useWatch({ control, name: 'objectives' });

  const create = useApiMutation('createInitiative', {
    onSuccess: async (initiative) => {
      await queryClient.invalidateQueries();
      await navigate({
        to: '/initiatives',
        search: { tab: 'pipeline' },
        state: {
          notice:
            initiative.status === 'DRAFT'
              ? `${initiative.code} · ${initiative.title} was saved as a draft.`
              : `${initiative.code} · ${initiative.title} was submitted to the Strategy Office for approval.`,
        },
      });
    },
    onError: (error) => {
      // Put the server's field errors next to the fields they belong to.
      for (const [path, message] of Object.entries(error.fieldErrors)) {
        setError(path as FieldPath<FormInput>, { message });
      }
      if (error.code === 'CODE_TAKEN') {
        setError('code', { message: errorMessage(error) });
      }
    },
  });

  const onSubmit = (next: 'PROPOSED' | 'DRAFT') => {
    setStatus(next);
    return handleSubmit((input) =>
      create.mutate({ body: { ...input, status: next } }),
    )();
  };

  // Elements grouped under their top-level element, for the objective picker.
  const groups = useMemo(() => {
    const byId = new Map(elements.map((e) => [e.id, e]));
    const rootOf = (e: MapElement): MapElement => {
      let node = e;
      while (node.parentId && byId.has(node.parentId))
        node = byId.get(node.parentId)!;
      return node;
    };
    const roots = elements.filter((e) => e.parentId === null);
    return roots.map((root) => ({
      root,
      options: elements.filter((e) => e !== root && rootOf(e).id === root.id),
    }));
  }, [elements]);

  const totalWeight = (links ?? []).reduce(
    (sum, link) => sum + (Number(link?.weight) || 0),
    0,
  );
  const formError =
    create.error &&
    Object.keys(create.error.fieldErrors).length === 0 &&
    create.error.code !== 'CODE_TAKEN'
      ? errorMessage(create.error)
      : null;
  const objectivesError =
    errors.objectives?.root?.message ?? errors.objectives?.message;
  const objectiveLabel = (
    levelLabels[1] ??
    levelLabels[0] ??
    'Objective'
  ).toLowerCase();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link to="/initiatives" className="hover:underline">
            Initiatives
          </Link>
        }
        title="Propose initiative"
        description="Describe what you want to do, which part of the strategy it delivers, who is accountable, and when."
      />

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit('PROPOSED');
        }}
        className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
      >
        <div className="flex min-w-0 flex-col gap-6">
          {formError && <Alert tone="danger">{formError}</Alert>}

          <Section number={1} title="Details">
            <Field label="Title" error={errors.title?.message} required>
              {(c) => <Input {...c} {...register('title')} />}
            </Field>
            <Field
              label="Description"
              hint="What will be done, in a few sentences."
              error={errors.description?.message}
            >
              {(c) => (
                <Textarea
                  {...c}
                  rows={3}
                  {...register('description', { setValueAs: blankToNull })}
                />
              )}
            </Field>
            <Field
              label="Business case"
              hint="Why it is worth doing: the value it should create and how you will know."
              error={errors.businessCase?.message}
            >
              {(c) => (
                <Textarea
                  {...c}
                  rows={4}
                  {...register('businessCase', { setValueAs: blankToNull })}
                />
              )}
            </Field>
            <Field
              label="Scope"
              hint="What is in and out."
              error={errors.scope?.message}
            >
              {(c) => (
                <Textarea
                  {...c}
                  rows={3}
                  {...register('scope', { setValueAs: blankToNull })}
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
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
              <Field
                label="Code"
                hint="Optional — suggested from the primary objective, e.g. DIG-016."
                error={errors.code?.message}
              >
                {(c) => (
                  <Input
                    {...c}
                    className="font-mono"
                    {...register('code', { setValueAs: blankToUndefined })}
                  />
                )}
              </Field>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                {...register('isSensitive')}
              />
              <span>
                <span className="font-medium text-ink">Restricted</span>
                <span className="block text-ink-muted">
                  Only the Strategy Office, its owner, sponsor and benefits
                  owner can see it.
                </span>
              </span>
            </label>
          </Section>

          <Section
            number={2}
            title="Strategic fit"
            description={`Which ${objectiveLabel}s it delivers, and how much of each. Mark the one it mainly serves as primary.`}
          >
            {objectivesError && <Alert tone="danger">{objectivesError}</Alert>}
            <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
              <legend className="sr-only">Contributes to</legend>
              {objectives.fields.map((field, index) => {
                const rowErrors = errors.objectives?.[index];
                return (
                  <div
                    key={field.id}
                    className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto_auto] sm:items-end"
                  >
                    <Field
                      label={`${levelLabels[1] ?? 'Objective'} ${index + 1}`}
                      error={rowErrors?.elementId?.message}
                      required
                    >
                      {(c) => (
                        <Select
                          {...c}
                          {...register(`objectives.${index}.elementId`)}
                        >
                          <option value="">Choose…</option>
                          {groups.map(({ root, options }) =>
                            options.length > 0 ? (
                              <optgroup key={root.id} label={root.title}>
                                {options.map((e) => (
                                  <option key={e.id} value={e.id}>
                                    {e.code} · {e.title}
                                  </option>
                                ))}
                              </optgroup>
                            ) : (
                              <option key={root.id} value={root.id}>
                                {root.code} · {root.title}
                              </option>
                            ),
                          )}
                        </Select>
                      )}
                    </Field>
                    <Field
                      label="Weight %"
                      error={rowErrors?.weight?.message}
                      required
                    >
                      {(c) => (
                        <Input
                          {...c}
                          type="number"
                          inputMode="decimal"
                          min={1}
                          max={100}
                          {...register(`objectives.${index}.weight`, {
                            valueAsNumber: true,
                          })}
                        />
                      )}
                    </Field>
                    <label className="flex h-10 items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="primaryObjective"
                        className="size-4 accent-primary"
                        checked={!!links?.[index]?.isPrimary}
                        onChange={() =>
                          objectives.fields.forEach((_, j) =>
                            setValue(`objectives.${j}.isPrimary`, j === index),
                          )
                        }
                      />
                      Primary
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${objectiveLabel} ${index + 1}`}
                      disabled={objectives.fields.length === 1}
                      onClick={() => {
                        const wasPrimary = links?.[index]?.isPrimary;
                        objectives.remove(index);
                        if (wasPrimary)
                          setValue('objectives.0.isPrimary', true);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </fieldset>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={objectives.fields.length >= 20}
                onClick={() =>
                  objectives.append({
                    elementId: '',
                    weight: 50,
                    isPrimary: false,
                  })
                }
              >
                <Plus aria-hidden="true" />
                Add another {objectiveLabel}
              </Button>
              <p className="text-xs text-ink-muted">
                Weights are each {objectiveLabel}’s share delivered by this
                initiative (they need not add up to 100; total here{' '}
                {totalWeight}%).
              </p>
            </div>
          </Section>

          <Section number={3} title="People">
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="ownerId"
                render={({ field, fieldState }) => (
                  <PeoplePicker
                    label="Owner"
                    hint={
                      isOffice
                        ? 'Accountable for delivery. Can be assigned later.'
                        : 'Leave empty to own it yourself.'
                    }
                    value={field.value ?? null}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="sponsorId"
                render={({ field, fieldState }) => (
                  <PeoplePicker
                    label="Executive sponsor"
                    onlyRole="EXECUTIVE_SPONSOR"
                    hint="Champions it and confirms progress."
                    value={field.value ?? null}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="benefitsOwnerId"
                render={({ field, fieldState }) => (
                  <PeoplePicker
                    label="Benefits owner"
                    hint="Answers for the value after delivery."
                    value={field.value ?? null}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Field label="Department" error={errors.departmentId?.message}>
                {(c) => (
                  <Select
                    {...c}
                    {...register('departmentId', { setValueAs: blankToNull })}
                  >
                    <option value="">None</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </Section>

          <Section
            number={4}
            title="Baseline and budget"
            description="The plan it will be measured against. It locks when the initiative starts; later changes go through a change request."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Start" error={errors.baselineStart?.message}>
                {(c) => (
                  <Input
                    {...c}
                    type="date"
                    {...register('baselineStart', { setValueAs: blankToNull })}
                  />
                )}
              </Field>
              <Field label="End" error={errors.baselineEnd?.message}>
                {(c) => (
                  <Input
                    {...c}
                    type="date"
                    {...register('baselineEnd', { setValueAs: blankToNull })}
                  />
                )}
              </Field>
              <Field
                label={`Budget (${currency})`}
                error={errors.baselineBudget?.message}
              >
                {(c) => (
                  <Input
                    {...c}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    {...register('baselineBudget', {
                      setValueAs: numberOrNull,
                    })}
                  />
                )}
              </Field>
            </div>
          </Section>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              loading={create.isPending && status === 'DRAFT'}
              disabled={create.isPending}
              onClick={() => void onSubmit('DRAFT')}
            >
              Save draft
            </Button>
            <Button
              type="submit"
              loading={create.isPending && status === 'PROPOSED'}
              disabled={create.isPending}
            >
              Submit proposal
            </Button>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <CardBody>
              <h2 className="font-semibold text-ink">What happens next</h2>
              <ol className="mt-3 flex flex-col gap-3 text-sm text-ink">
                <li>
                  <span className="font-medium">
                    The Strategy Office reviews it
                  </span>
                  <span className="block text-ink-muted">
                    and may ask questions or suggest changes.
                  </span>
                </li>
                <li>
                  <span className="font-medium">Once approved,</span>
                  <span className="block text-ink-muted">
                    milestones and weights are added and it is activated.
                  </span>
                </li>
                <li>
                  <span className="font-medium">From then on,</span>
                  <span className="block text-ink-muted">
                    its owner reports progress every month.
                  </span>
                </li>
              </ol>
              <p className="mt-4 text-xs text-ink-muted">
                A draft stays private to you and the Strategy Office until you
                submit it.
              </p>
            </CardBody>
          </Card>
        </aside>
      </form>
    </div>
  );
}

function Section({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const id = `section-${number}`;
  return (
    <Card aria-labelledby={id}>
      <CardBody className="flex flex-col gap-4">
        <header>
          <h2 id={id} className="text-base font-semibold text-ink">
            {number} · {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm text-ink-muted">{description}</p>
          )}
        </header>
        {children}
      </CardBody>
    </Card>
  );
}
