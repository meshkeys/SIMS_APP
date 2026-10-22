import { zodResolver } from '@hookform/resolvers/zod';
import {
  PASSWORD_RESET_TTL_MINUTES,
  type PasswordResetRequestInput,
  passwordResetRequestSchema,
} from '@sims/contracts';
import { Link, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { errorMessage } from '@/lib/api/errors';
import { request } from '@/lib/api/client';
import { AuthLayout } from './auth-layout';

/**
 * Ask for a link to choose a new password. The answer is the same whether
 * or not the email has an account, so this page never says which.
 */
export function ForgotPasswordPage() {
  const { email: prefilled } = useSearch({ from: '/forgot-password' });
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordResetRequestInput>({
    resolver: zodResolver(passwordResetRequestSchema),
    defaultValues: { email: prefilled ?? '' },
  });

  const onSubmit = handleSubmit(async (input) => {
    setFormError(null);
    try {
      await request('requestPasswordReset', { body: input });
      setSentTo(input.email);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  if (sentTo) {
    return (
      <AuthLayout title="Check your email">
        <Alert tone="success">
          If an account uses <strong>{sentTo}</strong>, we have sent it a link
          to choose a new password. The link works once, for{' '}
          {PASSWORD_RESET_TTL_MINUTES} minutes.
        </Alert>
        <p className="mt-4 text-sm text-ink-muted">
          Nothing after a few minutes? Check your spam folder, or make sure you
          used the email address your organisation invited. You can ask again in
          a minute.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/login">Back to sign in</Link>
          </Button>
          <Button variant="secondary" onClick={() => setSentTo(null)}>
            Use another email
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      description="Enter the email you sign in with. We will send you a link to choose a new password."
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Email" error={errors.email?.message} required>
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
        <Button type="submit" size="lg" loading={isSubmitting}>
          Send reset link
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-muted">
        Remembered it?{' '}
        <Link to="/login" className="font-medium text-primary underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
