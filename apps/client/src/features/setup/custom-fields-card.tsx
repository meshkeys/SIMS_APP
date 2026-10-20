import type { CustomFieldView } from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { apiKey, useApiMutation } from '@/lib/api/query';

const TYPES = [
  { value: 'TEXT', label: 'Text' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'CURRENCY', label: 'Amount of money' },
  { value: 'DATE', label: 'Date' },
  { value: 'SELECT', label: 'One choice from a list' },
  { value: 'MULTI_SELECT', label: 'Several choices from a list' },
  { value: 'BOOLEAN', label: 'Yes or no' },
  { value: 'USER', label: 'A person' },
] as const;
type FieldType = (typeof TYPES)[number]['value'];
const typeLabel = (type: string) =>
  TYPES.find((t) => t.value === type)?.label ?? type;

/** Extra details captured on each initiative ("Budget code", "Funding source"). */
export function CustomFieldsCard({ fields }: { fields: CustomFieldView[] }) {
  const [adding, setAdding] = useState(false);
  const queryClient = useQueryClient();
  const remove = useApiMutation('deleteCustomField', {
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: apiKey('getOnboarding') }),
  });
  return (
    <Card aria-labelledby="custom-fields-title">
      <CardHeader
        titleId="custom-fields-title"
        title="Custom fields"
        description='Capture extra details your organisation needs on each initiative, e.g. "Budget code", "Funding source" or "Revenue line".'
        action={
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Add custom field
          </Button>
        }
      />
      {(fields.length > 0 || remove.isError) && (
        <CardBody className="flex flex-col gap-3">
          {remove.isError && (
            <Alert tone="danger">{errorMessage(remove.error)}</Alert>
          )}
          <ul className="flex flex-wrap gap-2">
            {fields.map((field) => (
              <li
                key={field.id}
                className="flex items-center gap-2 rounded-md border border-border bg-surface py-1 pr-1 pl-3 text-sm"
              >
                <span className="font-medium text-ink">{field.label}</span>
                <Badge>{typeLabel(field.type)}</Badge>
                {field.required && <Badge tone="info">Required</Badge>}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${field.label}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ params: { id: field.id } })}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </CardBody>
      )}
      {adding && <AddFieldDialog onClose={() => setAdding(false)} />}
    </Card>
  );
}

function AddFieldDialog({ onClose }: { onClose: () => void }) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FieldType>('TEXT');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);
  const queryClient = useQueryClient();
  const create = useApiMutation('createCustomField', {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: apiKey('getOnboarding'),
      });
      onClose();
    },
  });
  const choices = type === 'SELECT' || type === 'MULTI_SELECT';
  const fieldErrors =
    create.error instanceof ApiError ? create.error.fieldErrors : {};
  const labelError =
    fieldErrors.label ??
    (create.error instanceof ApiError && create.error.code === 'FIELD_EXISTS'
      ? errorMessage(create.error)
      : undefined);
  const otherError =
    create.isError && !labelError && Object.keys(fieldErrors).length === 0
      ? errorMessage(create.error)
      : null;

  const onSubmit = (event: FormEvent) => {
    // The dialog's form sits inside the step's form in the React tree.
    event.preventDefault();
    event.stopPropagation();
    create.mutate({
      body: {
        label: label.trim(),
        type,
        required,
        options: choices
          ? options
              .split('\n')
              .map((o) => o.trim())
              .filter(Boolean)
          : undefined,
      },
    });
  };

  const formId = 'custom-field-form';
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Add a custom field"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={create.isPending}>
            Add field
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
      >
        {otherError && <Alert tone="danger">{otherError}</Alert>}
        <Field label="Field name" required error={labelError}>
          {(control) => (
            <Input
              {...control}
              value={label}
              maxLength={60}
              placeholder="e.g. Funding source"
              onChange={(e) => setLabel(e.target.value)}
            />
          )}
        </Field>
        <Field label="Type of answer" error={fieldErrors.type}>
          {(control) => (
            <Select
              {...control}
              value={type}
              onChange={(e) => setType(e.target.value as FieldType)}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {choices && (
          <Field
            label="Choices"
            hint="One per line, at least two."
            required
            error={fieldErrors.options}
          >
            {(control) => (
              <Textarea
                {...control}
                value={options}
                onChange={(e) => setOptions(e.target.value)}
              />
            )}
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          Required on every initiative
        </label>
      </form>
    </Dialog>
  );
}
