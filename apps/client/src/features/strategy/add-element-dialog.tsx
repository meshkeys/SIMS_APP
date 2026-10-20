import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateElementInput,
  createElementSchema,
  type StrategyMap,
} from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { apiKey, useApiMutation } from '@/lib/api/query';
import { errorMessage } from '@/lib/api/errors';

type FormInput = z.input<typeof createElementSchema>;

/** Optional fields left blank mean "not given", not an empty value. */
const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/**
 * Adds an element under any element that has a level below it (e.g. an
 * objective under a pillar), or a new top-level element. The code is
 * suggested by the server (P6, O6.1…) unless one is given.
 */
export function AddElementDialog({
  map,
  onClose,
}: {
  map: StrategyMap;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Position of an element's level in the framework (0 = top). Found by id,
  // so it does not matter where the API starts counting depth.
  const levelIndex = (levelId: string) =>
    map.levels.findIndex((level) => level.id === levelId);
  const parents = map.elements.filter(
    (e) => levelIndex(e.levelId) < map.levels.length - 1,
  );
  const second = map.levels[1];
  const defaultParent = second ? (parents[0]?.id ?? '') : '';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput, unknown, CreateElementInput>({
    resolver: zodResolver(createElementSchema),
    defaultValues: { parentId: defaultParent || undefined, title: '' },
  });

  const create = useApiMutation('createElement', {
    onSuccess: async (element) => {
      await queryClient.invalidateQueries({
        queryKey: apiKey('getCurrentStrategyMap'),
      });
      onClose();
      // Open what was just created.
      await navigate({ to: '/strategy', search: { element: element.id } });
    },
  });

  const onSubmit = handleSubmit((input) =>
    create.mutate({
      params: { id: map.plan.id },
      body: input,
    }),
  );

  const levelOf = (index: number) => map.levels[index]?.label ?? 'Element';

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Add ${(second ?? map.levels[0])?.label.toLowerCase() ?? 'element'}`}
      description="It appears on the strategy map straight away. KPIs and initiatives can be linked afterwards."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-element-form"
            loading={create.isPending}
          >
            Add
          </Button>
        </>
      }
    >
      <form
        id="add-element-form"
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
      >
        {create.error && (
          <Alert tone="danger">{errorMessage(create.error)}</Alert>
        )}
        <Field
          label="Under"
          hint={`Leave at the top to add a new ${levelOf(0).toLowerCase()}.`}
          error={errors.parentId?.message}
        >
          {(control) => (
            <Select
              {...control}
              {...register('parentId', { setValueAs: emptyToUndefined })}
            >
              <option value="">
                Top level (new {levelOf(0).toLowerCase()})
              </option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {'  '.repeat(levelIndex(p.levelId))}
                  {p.code} · {p.title} (adds a{' '}
                  {levelOf(levelIndex(p.levelId) + 1).toLowerCase()})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Title" error={errors.title?.message} required>
          {(control) => <Input {...control} {...register('title')} />}
        </Field>
        <Field
          label="Code"
          hint="Optional — suggested automatically, e.g. O2.3."
          error={errors.code?.message}
        >
          {(control) => (
            <Input
              {...control}
              className="w-40 font-mono"
              {...register('code', { setValueAs: emptyToUndefined })}
            />
          )}
        </Field>
        <Field label="Description" error={errors.description?.message}>
          {(control) => (
            <Textarea {...control} rows={3} {...register('description')} />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
