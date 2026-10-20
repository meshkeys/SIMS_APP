import {
  type OnboardingOrganisationInput,
  onboardingOrganisationSchema,
  type OrganisationSector,
} from '@sims/contracts';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useApiMutation } from '@/lib/api/query';
import {
  CURRENCIES,
  currencyLabel,
  MONTHS,
  TIME_ZONES,
  timeZoneLabel,
} from '@/lib/locale-options';
import { intentOf, issuesByPath, type StepProps } from './setup-helpers';
import { StepFooter } from './step-footer';

const SECTORS: { value: OrganisationSector; label: string }[] = [
  { value: 'PRIVATE', label: 'Private company' },
  { value: 'PUBLIC', label: 'Government or public body' },
  { value: 'NON_PROFIT', label: 'Non-profit or development organisation' },
];

const FORM_ID = 'setup-organisation';

/** Step 1: what sign-up asked, to check, plus when the financial year starts. */
export function OrganisationStep({ state, onSaved }: StepProps) {
  const org = state.organisation;
  const [form, setForm] = useState<OnboardingOrganisationInput>({
    name: org.name,
    sector: org.sector,
    country: org.country,
    currency: org.currency,
    timezone: org.timezone,
    fiscalYearStartMonth: org.fiscalYearStartMonth,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useApiMutation('saveOnboardingOrganisation');
  const set = (change: Partial<OnboardingOrganisationInput>) =>
    setForm((f) => ({ ...f, ...change }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const intent = intentOf(event);
    const parsed = onboardingOrganisationSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(issuesByPath(parsed.error.issues));
      return;
    }
    setErrors({});
    save.mutate(
      { body: parsed.data },
      {
        onSuccess: (next) => onSaved(next, intent),
        onError: (error) => {
          if (error instanceof ApiError) setErrors(error.fieldErrors);
        },
      },
    );
  };

  const otherError =
    save.isError && Object.keys(errors).length === 0
      ? errorMessage(save.error)
      : null;

  return (
    <form
      id={FORM_ID}
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-6"
    >
      <Card aria-labelledby="setup-organisation-title">
        <CardHeader
          titleId="setup-organisation-title"
          title="Tell us about your organisation"
          description="Currency and time zone decide how figures and deadlines are shown. The financial year sets your plan periods and reporting years."
        />
        <CardBody className="flex flex-col gap-5">
          {otherError && <Alert tone="danger">{otherError}</Alert>}
          <Field label="Organisation name" required error={errors.name}>
            {(control) => (
              <Input
                {...control}
                value={form.name}
                maxLength={120}
                autoComplete="organization"
                onChange={(e) => set({ name: e.target.value })}
              />
            )}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Sector" required error={errors.sector}>
              {(control) => (
                <Select
                  {...control}
                  value={form.sector}
                  onChange={(e) =>
                    set({ sector: e.target.value as OrganisationSector })
                  }
                >
                  {SECTORS.map((sector) => (
                    <option key={sector.value} value={sector.value}>
                      {sector.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="Country"
              hint="Two-letter code, e.g. NG or KE"
              required
              error={errors.country}
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
            <Field label="Currency" required error={errors.currency}>
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
            <Field label="Time zone" required error={errors.timezone}>
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
              error={errors.fiscalYearStartMonth}
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
          </div>
        </CardBody>
      </Card>
      <StepFooter formId={FORM_ID} saving={save.isPending} />
    </form>
  );
}
