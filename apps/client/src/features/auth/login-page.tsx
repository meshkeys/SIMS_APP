import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginInput, loginSchema } from '@sims/contracts';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { safeRedirect, useAuth } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/page-header';
import { ApiError, errorMessage } from '@/lib/api/errors';

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
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-text lg:flex">
        <Brand />
        <div className="max-w-md">
          <p className="text-2xl leading-snug font-semibold text-white">
            Completion is not success.
          </p>
          <p className="mt-3 text-sidebar-muted">
            SIMS tracks whether delivered work is creating the value your
            strategy promised — with verified figures, not opinions.
          </p>
        </div>
        <p className="text-xs text-sidebar-muted">
          Strategic Initiative Management &amp; Execution Tracking
        </p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Brand dark={false} />
          </div>
          <PageHeader
            title="Sign in"
            description="Use the email address your organisation invited."
          />
          <form
            noValidate
            onSubmit={onSubmit}
            className="mt-8 flex flex-col gap-5"
          >
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
          {import.meta.env.DEV && (
            <p className="mt-8 rounded-md bg-neutral-soft px-3 py-2 text-xs text-neutral">
              Demo:{' '}
              <span className="font-mono">amara.bello@meridian.example</span> ·
              password <span className="font-mono">Meridian-demo-2026</span>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

export function Brand({ dark = true }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-md bg-canvas font-bold text-sidebar"
      >
        S
      </span>
      <span className="leading-tight">
        <span
          className={
            dark
              ? 'block font-semibold text-white'
              : 'block font-semibold text-ink'
          }
        >
          SIMS
        </span>
        <span
          className={
            dark
              ? 'block text-xs text-sidebar-muted'
              : 'block text-xs text-ink-muted'
          }
        >
          Strategy Execution Office
        </span>
      </span>
    </div>
  );
}
