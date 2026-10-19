import type {
  OrganisationSettings,
  UpdateOrganisationInput,
} from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useApiMutation, useApiQuery } from '@/lib/api/query';
import { hasAnyRole } from '@/lib/access';
import {
  CURRENCIES,
  currencyLabel,
  MONTHS,
  TIME_ZONES,
  timeZoneLabel,
} from '@/lib/locale-options';

const TERMS = [
  { key: 'kpi', label: 'KPIs are called' },
  { key: 'initiative', label: 'Initiatives are called' },
  { key: 'milestone', label: 'Milestones are called' },
  { key: 'task', label: 'Tasks are called' },
] as const;

type Form = Required<Omit<UpdateOrganisationInput, 'terminology'>> & {
  terminology: OrganisationSettings['terminology'];
};

const formOf = (org: OrganisationSettings): Form => ({
  name: org.name,
  country: org.country,
  currency: org.currency,
  timezone: org.timezone,
  fiscalYearStartMonth: org.fiscalYearStartMonth,
  terminology: { ...org.terminology },
});

/** Only what changed, so the audit log records only that. */
function changesOf(org: OrganisationSettings, form: Form) {
  const changes: UpdateOrganisationInput = {};
  if (form.name.trim() !== org.name) changes.name = form.name;
  if (form.country.trim().toUpperCase() !== org.country)
    changes.country = form.country;
  if (form.currency !== org.currency) changes.currency = form.currency;
  if (form.timezone !== org.timezone) changes.timezone = form.timezone;
  if (form.fiscalYearStartMonth !== org.fiscalYearStartMonth)
    changes.fiscalYearStartMonth = form.fiscalYearStartMonth;
  if (
    TERMS.some((t) => form.terminology[t.key].trim() !== org.terminology[t.key])
  )
    changes.terminology = form.terminology;
  return changes;
}

/** The organisation's own settings; a system administrator changes them. */
export function OrganisationSettingsSection() {
  const organisation = useApiQuery('getOrganisation', {});
  if (organisation.isPending) {
    return (
      <>
        <output className="sr-only">Loading the organisation settings…</output>
        <Skeleton className="h-96" />
      </>
    );
  }
  if (organisation.isError) {
    return (
      <Card>
        <ErrorState
          error={organisation.error}
          onRetry={() => void organisation.refetch()}
        />
      </Card>
    );
  }
  return (
    <OrganisationForm
      key={organisation.data.id}
      organisation={organisation.data}
    />
  );
}

function OrganisationForm({
  organisation: org,
}: {
  organisation: OrganisationSettings;
}) {
  const session = useSession();
  const editable = hasAnyRole(session, ['SYSTEM_ADMIN']);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(() => formOf(org));
  const [saved, setSaved] = useState(false);
  const save = useApiMutation('updateOrganisation', {
    onSuccess: async (updated) => {
      setForm(formOf(updated));
      setSaved(true);
      await queryClient.invalidateQueries();
    },
  });
  const changes = changesOf(org, form);
  const dirty = Object.keys(changes).length > 0;
  const fieldErrors =
    save.error instanceof ApiError ? save.error.fieldErrors : {};

  const set = (change: Partial<Form>) => {
    setSaved(false);
    save.reset();
    setForm((f) => ({ ...f, ...change }));
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (dirty) save.mutate({ body: changes });
  };

  return (
    <Card aria-labelledby="organisation-title">
      <CardHeader
        titleId="organisation-title"
        title="Organisation"
        description="Currency and time zone change how figures and deadlines are shown, not the data itself."
      />
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          {!editable && (
            <Alert tone="info">
              Only a system administrator can change these settings.
            </Alert>
          )}
          {saved && (
            <Alert tone="success">
              Settings saved. Everyone sees them from their next session
              refresh, within 15 minutes.
            </Alert>
          )}
          {save.isError && Object.keys(fieldErrors).length === 0 && (
            <Alert tone="danger">{errorMessage(save.error)}</Alert>
          )}

          <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
            <legend className="sr-only">Organisation details</legend>
            <Field label="Name" required error={fieldErrors.name}>
              {(control) => (
                <Input
                  {...control}
                  value={form.name}
                  maxLength={120}
                  onChange={(e) => set({ name: e.target.value })}
                />
              )}
            </Field>
            <Field
              label="Workspace address"
              hint="Fixed when the workspace was created."
            >
              {(control) => <Input {...control} value={org.slug} readOnly />}
            </Field>
            <Field
              label="Country"
              hint="Two-letter code, e.g. NG or KE"
              required
              error={fieldErrors.country}
            >
              {(control) => (
                <Input
                  {...control}
                  value={form.country}
                  maxLength={2}
                  autoComplete="country"
                  className="uppercase"
                  onChange={(e) => set({ country: e.target.value })}
                />
              )}
            </Field>
            <Field label="Currency" required error={fieldErrors.currency}>
              {(control) => (
                <Select
                  {...control}
                  value={form.currency}
                  onChange={(e) => set({ currency: e.target.value })}
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {currencyLabel(code)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Time zone" required error={fieldErrors.timezone}>
              {(control) => (
                <Select
                  {...control}
                  value={form.timezone}
                  onChange={(e) => set({ timezone: e.target.value })}
                >
                  {!TIME_ZONES.includes(form.timezone) && (
                    <option value={form.timezone}>{form.timezone}</option>
                  )}
                  {TIME_ZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {timeZoneLabel(zone)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="Financial year starts in"
              required
              error={fieldErrors.fiscalYearStartMonth}
            >
              {(control) => (
                <Select
                  {...control}
                  value={form.fiscalYearStartMonth}
                  onChange={(e) =>
                    set({ fiscalYearStartMonth: Number(e.target.value) })
                  }
                >
                  {MONTHS.map((month, i) => (
                    <option key={month} value={i + 1}>
                      {month}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </fieldset>

          <fieldset disabled={!editable} className="flex flex-col gap-3">
            <legend className="text-sm font-semibold text-ink">
              Terminology
            </legend>
            <p className="text-sm text-ink-muted">
              The words your organisation uses, shown across the app.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {TERMS.map((term) => (
                <Field
                  key={term.key}
                  label={term.label}
                  required
                  error={fieldErrors[`terminology.${term.key}`]}
                >
                  {(control) => (
                    <Input
                      {...control}
                      value={form.terminology[term.key]}
                      maxLength={40}
                      onChange={(e) =>
                        set({
                          terminology: {
                            ...form.terminology,
                            [term.key]: e.target.value,
                          },
                        })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
          </fieldset>

          {editable && (
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={!dirty || save.isPending}
                onClick={() => {
                  save.reset();
                  setForm(formOf(org));
                }}
              >
                Discard changes
              </Button>
              <Button type="submit" disabled={!dirty} loading={save.isPending}>
                Save settings
              </Button>
            </div>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
