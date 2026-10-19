import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginInput, loginSchema } from '@sims/contracts';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { safeRedirect, useAuth } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { AuthLayout } from './auth-layout';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: '/login' });
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    // The same rules the server applies (from @sims/contracts).
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (input) => {
    setFormError(null);
    try {
      await signIn(input);
      await navigate({ to: safeRedirect(redirect) });
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.code === 'INVALID_CREDENTIALS'
          ? 'That email and password do not match. Check them and try again.'
          : errorMessage(error),
      );
    }
  });

  return (
    <AuthLayout
      title="Sign in"
      description="Use the email address your organisation invited."
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
        <Field label="Password" error={errors.password?.message} required>
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
          )}
        </Field>
        <Button type="submit" size="lg" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-muted">
        New to SIMS?{' '}
        <Link to="/signup" className="font-medium text-primary underline">
          Set up a workspace for your organisation
        </Link>
      </p>
      {import.meta.env.DEV && (
        <p className="mt-8 rounded-md bg-neutral-soft px-3 py-2 text-xs text-neutral">
          Demo: <span className="font-mono">amara.bello@meridian.example</span>{' '}
          · password <span className="font-mono">Meridian-demo-2026</span>
        </p>
      )}
    </AuthLayout>
  );
}
