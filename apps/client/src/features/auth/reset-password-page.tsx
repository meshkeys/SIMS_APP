import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useAuth } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/states';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { request } from '@/lib/api/client';
import { useApiQuery } from '@/lib/api/query';
import { AuthLayout } from './auth-layout';

/** Why a link cannot be used, in words, with what to do next. */
const LINK_PROBLEMS: Record<string, { title: string; text: string }> = {
  RESET_LINK_INVALID: {
    title: 'This reset link is not valid',
    text: 'Make sure you opened the whole link from the most recent email. Asking again replaces earlier links.',
  },
  RESET_LINK_USED: {
    title: 'This reset link has already been used',
    text: 'Your password was changed with it. Sign in, or ask for a new link if you need to change it again.',
  },
  RESET_LINK_EXPIRED: {
    title: 'This reset link has expired',
    text: 'For your security, links work for a short time only. Ask for a new one.',
  },
};

const MIN_LENGTH = 12;

/** Where "forgot password" emails link: choose a new password. */
export function ResetPasswordPage() {
  const { token } = useSearch({ from: '/reset-password' });
  const link = useApiQuery(
    'checkPasswordReset',
    { body: { token: token ?? '' } },
    { enabled: Boolean(token), retry: false, staleTime: Infinity },
  );

  if (!token) return <LinkProblem code="RESET_LINK_INVALID" />;
  if (link.isPending) {
    return (
      <AuthLayout title="Opening your reset link">
        <output className="sr-only">Checking your link…</output>
        <Skeleton className="h-48" />
      </AuthLayout>
    );
  }
  if (link.isError) {
    const code = link.error instanceof ApiError ? link.error.code : '';
    return LINK_PROBLEMS[code] ? (
      <LinkProblem code={code} />
    ) : (
      <AuthLayout title="Your reset link could not be opened">
        <Alert tone="danger">{errorMessage(link.error)}</Alert>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => void link.refetch()}
        >
          Try again
        </Button>
      </AuthLayout>
    );
  }
  return <NewPasswordForm token={token} email={link.data.email} />;
}

function LinkProblem({ code }: { code: string }) {
  const problem = LINK_PROBLEMS[code]!;
  return (
    <AuthLayout title={problem.title}>
      <Alert tone="warning">{problem.text}</Alert>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/forgot-password">Ask for a new link</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/login">Go to sign in</Link>
        </Button>
      </div>
    </AuthLayout>
  );
}

function NewPasswordForm({ token, email }: { token: string; email: string }) {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [linkProblem, setLinkProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const local: Record<string, string> = {};
    if (password.length < MIN_LENGTH)
      local.password = `Use at least ${MIN_LENGTH} characters`;
    else if (confirm !== password)
      local.confirm = 'The two passwords do not match';
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;

    setSaving(true);
    try {
      await request('completePasswordReset', { body: { token, password } });
      // Every session was signed out, this one included.
      if (session) await signOut();
      await navigate({ to: '/login', search: { notice: 'password-reset' } });
    } catch (error) {
      if (error instanceof ApiError && LINK_PROBLEMS[error.code]) {
        setLinkProblem(error.code);
      } else if (
        error instanceof ApiError &&
        Object.keys(error.fieldErrors).length > 0
      ) {
        setErrors(error.fieldErrors);
      } else {
        setFormError(errorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  };

  if (linkProblem) return <LinkProblem code={linkProblem} />;

  return (
    <AuthLayout
      title="Choose a new password"
      description={`For ${email}. You will be signed out everywhere, then sign in with the new password.`}
    >
      <form
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-5"
      >
        {formError && <Alert tone="danger">{formError}</Alert>}
        {/* Lets password managers save the new password against the right email. */}
        <input
          type="email"
          autoComplete="username"
          value={email}
          readOnly
          hidden
        />
        <Field
          label="New password"
          hint={`At least ${MIN_LENGTH} characters. A short phrase is easier to remember than symbols.`}
          error={errors.password}
          required
        >
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Field label="Type it again" error={errors.confirm} required>
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" size="lg" loading={saving}>
          Change password
        </Button>
      </form>
    </AuthLayout>
  );
}
