import type { MapElement } from '@sims/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';

/** The part of any form this editor works on. */
interface ObjectivesForm {
  objectives: { elementId: string; weight: number; isPrimary?: boolean }[];
}

/**
 * Which strategy elements an initiative delivers, with weights and one
 * primary. Used when proposing an initiative and when the Strategy Office
 * relinks it. Must sit inside a react-hook-form <FormProvider>.
 */
export function ObjectivesEditor({
  elements,
  levelLabels,
}: {
  elements: MapElement[];
  levelLabels: string[];
}) {
  const {
    control,
    register,
    setValue,
    formState: { errors },
  } = useFormContext<ObjectivesForm>();
  const objectives = useFieldArray({ control, name: 'objectives' });
  const links = useWatch({ control, name: 'objectives' });

  // Elements grouped under their top-level element.
  const groups = useMemo(() => {
    const byId = new Map(elements.map((e) => [e.id, e]));
    const rootOf = (e: MapElement): MapElement => {
      let node = e;
      while (node.parentId && byId.has(node.parentId))
        node = byId.get(node.parentId)!;
      return node;
    };
    return elements
      .filter((e) => e.parentId === null)
      .map((root) => ({
        root,
        options: elements.filter((e) => e !== root && rootOf(e).id === root.id),
      }));
  }, [elements]);

  const label = levelLabels[1] ?? levelLabels[0] ?? 'Objective';
  const lower = label.toLowerCase();
  const totalWeight = (links ?? []).reduce(
    (sum, l) => sum + (Number(l?.weight) || 0),
    0,
  );
  const listError =
    errors.objectives?.root?.message ?? errors.objectives?.message;

  return (
    <div className="flex flex-col gap-4">
      {listError && <Alert tone="danger">{listError}</Alert>}
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
                label={`${label} ${index + 1}`}
                error={rowErrors?.elementId?.message}
                required
              >
                {(c) => (
                  <Select {...c} {...register(`objectives.${index}.elementId`)}>
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
                      setValue(`objectives.${j}.isPrimary`, j === index, {
                        shouldDirty: true,
                      }),
                    )
                  }
                />
                Primary
              </label>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${lower} ${index + 1}`}
                disabled={objectives.fields.length === 1}
                onClick={() => {
                  const wasPrimary = links?.[index]?.isPrimary;
                  objectives.remove(index);
                  if (wasPrimary)
                    setValue('objectives.0.isPrimary', true, {
                      shouldDirty: true,
                    });
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
            objectives.append({ elementId: '', weight: 50, isPrimary: false })
          }
        >
          <Plus aria-hidden="true" />
          Add another {lower}
        </Button>
        <p className="text-xs text-ink-muted">
          Weights are each {lower}’s share delivered by this initiative (they
          need not add up to 100; total here {totalWeight}%).
        </p>
      </div>
    </div>
  );
}
