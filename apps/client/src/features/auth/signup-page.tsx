import { zodResolver } from '@hookform/resolvers/zod';
import {
  type OrganisationSector,
  type SignupInput,
  signupSchema,
} from '@sims/contracts';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { type FieldPath, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useAuth } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { request } from '@/lib/api/client';
import {
  CURRENCIES,
  currencyLabel,
  TIME_ZONES,
  timeZoneLabel,
} from '@/lib/locale-options';
import { AuthLayout } from './auth-layout';

type SignupForm = z.input<typeof signupSchema>;

const SECTORS: { value: OrganisationSector; label: string }[] = [
  { value: 'PRIVATE', label: 'Private company' },
  { value: 'PUBLIC', label: 'Government or public body' },
  { value: 'NON_PROFIT', label: 'Non-profit or development organisation' },
];

/** The browser's own time zone when SIMS knows it, else Lagos. */
const defaultTimeZone = () => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIME_ZONES.includes(zone) ? zone : 'Africa/Lagos';
};

/** Blank optional fields are left out rather than sent empty. */
const optional = (value: string) => (value.trim() === '' ? undefined : value);

/** Creates an organisation's workspace and its first administrator. */
export function SignupPage() {
  const { startSession } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupForm, unknown, SignupInput>({
    // The same rules the server applies (from @sims/contracts).
    resolver: zodResolver(signupSchema),
    defaultValues: {
      organisationName: '',
      sector: 'PRIVATE',
      country: '',
      currency: 'NGN',
      timezone: defaultTimeZone(),
      name: '',
      email: '',
      password: '',
    },
  });

  const onSubmit = handleSubmit(async (input) => {
    setFormError(null);
    setEmailTaken(false);
    try {
      startSession(await request('signup', { body: input }));
      await navigate({ to: '/' });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_TAKEN') {
        setEmailTaken(true);
        setError('email', {
          message: 'An account already uses this email address.',
        });
      } else if (error instanceof ApiError && error.code === 'SLUG_TAKEN') {
        setError('organisationSlug', {
          message: 'Another organisation uses this address. Try another.',
        });
      } else if (
        error instanceof ApiError &&
        Object.keys(error.fieldErrors).length > 0
      ) {
        for (const [path, message] of Object.entries(error.fieldErrors)) {
          setError(path as FieldPath<SignupForm>, { message });
        }
      } else {
        setFormError(errorMessage(error));
      }
    }
  });

  return (
    <AuthLayout
      wide
      title="Set up your workspace"
      description="Create a workspace for your organisation. You will be its administrator, and can invite your team next."
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-8">
        {formError && <Alert tone="danger">{formError}</Alert>}

        <fieldset className="flex flex-col gap-5">
          <legend className="mb-4 text-base font-semibold text-ink">
            Your organisation
          </legend>
          <Field
            label="Organisation name"
            error={errors.organisationName?.message}
            required
          >
            {(control) => (
              <Input
                {...control}
                autoComplete="organization"
                {...register('organisationName')}
              />
            )}
          </Field>
          <Field
            label="Workspace address"
            hint="Optional: lowercase letters, numbers and hyphens, e.g. meridian. Leave blank to make one from the name."
            error={errors.organisationSlug?.message}
          >
            {(control) => (
              <Input
                {...control}
                autoCapitalize="none"
                spellCheck={false}
                {...register('organisationSlug', { setValueAs: optional })}
              />
            )}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Sector" error={errors.sector?.message} required>
              {(control) => (
                <Select {...control} {...register('sector')}>
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
              error={errors.country?.message}
              required
            >
              {(control) => (
                <Input
                  {...control}
                  maxLength={2}
                  autoComplete="country"
                  className="uppercase"
                  {...register('country')}
                />
              )}
            </Field>
            <Field label="Currency" error={errors.currency?.message} required>
              {(control) => (
                <Select {...control} {...register('currency')}>
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {currencyLabel(code)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Time zone" error={errors.timezone?.message} required>
              {(control) => (
                <Select {...control} {...register('timezone')}>
                  {TIME_ZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {timeZoneLabel(zone)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-5">
          <legend className="mb-4 text-base font-semibold text-ink">
            Your account
          </legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Your name" error={errors.name?.message} required>
              {(control) => (
                <Input {...control} autoComplete="name" {...register('name')} />
              )}
            </Field>
            <Field label="Job title" error={errors.jobTitle?.message}>
              {(control) => (
                <Input
                  {...control}
                  autoComplete="organization-title"
                  {...register('jobTitle', { setValueAs: optional })}
                />
              )}
            </Field>
          </div>
          <Field label="Work email" error={errors.email?.message} required>
            {(control) => (
              <Input
                {...control}
                type="email"
                autoComplete="username"
                inputMode="email"
                {...register('email')}
              />
            )}
          </Field>
          {emailTaken && (
            <p className="-mt-3 text-sm text-ink-muted">
              <Link to="/login" className="font-medium text-primary underline">
                Sign in instead
              </Link>
              , or ask your organisation to invite you.
            </p>
          )}
          <Field
            label="Password"
            hint="At least 12 characters. A short phrase is easier to remember than symbols."
            error={errors.password?.message}
            required
          >
            {(control) => (
              <Input
                {...control}
                type="password"
                autoComplete="new-password"
                {...register('password')}
              />
            )}
          </Field>
        </fieldset>

        <Button type="submit" size="lg" loading={isSubmitting}>
          Create workspace
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-muted">
        Already using SIMS?{' '}
        <Link to="/login" className="font-medium text-primary underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
