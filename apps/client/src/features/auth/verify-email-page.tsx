import { Link, useSearch } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';
import { useAuth } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/states';
import { refreshSession } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useApiQuery } from '@/lib/api/query';
import { AuthLayout } from './auth-layout';

const LINK_PROBLEMS: Record<string, { title: string; text: string }> = {
  VERIFY_LINK_INVALID: {
    title: 'This confirmation link is not valid',
    text: 'Make sure you opened the whole link from the most recent email. Sending a new link replaces earlier ones.',
  },
  VERIFY_LINK_EXPIRED: {
    title: 'This confirmation link has expired',
    text: 'Sign in to SIMS and choose "Send the link again" in the reminder at the top of the page.',
  },
};

/** Where "confirm your email" links point. Works signed in or not. */
export function VerifyEmailPage() {
  const { token } = useSearch({ from: '/verify-email' });
  const { session } = useAuth();
  const result = useApiQuery(
    'verifyEmail',
    { body: { token: token ?? '' } },
    { enabled: Boolean(token), retry: false, staleTime: Infinity },
  );
  const signedIn = session !== null;

  // A signed-in session still says "not confirmed" until it is refreshed.
  useEffect(() => {
    if (result.isSuccess && signedIn) void refreshSession();
  }, [result.isSuccess, signedIn]);

  const next = signedIn ? (
    <Button asChild>
      <Link to="/">Continue to SIMS</Link>
    </Button>
  ) : (
    <Button asChild>
      <Link to="/login">Sign in</Link>
    </Button>
  );

  if (!token) return <LinkProblem code="VERIFY_LINK_INVALID" next={next} />;
  if (result.isPending) {
    return (
      <AuthLayout title="Confirming your email">
        <output className="sr-only">Confirming your email address…</output>
        <Skeleton className="h-24" />
      </AuthLayout>
    );
  }
  if (result.isError) {
    const code = result.error instanceof ApiError ? result.error.code : '';
    return LINK_PROBLEMS[code] ? (
      <LinkProblem code={code} next={next} />
    ) : (
      <AuthLayout title="Your email could not be confirmed">
        <Alert tone="danger">{errorMessage(result.error)}</Alert>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => void result.refetch()}
        >
          Try again
        </Button>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Email confirmed">
      <Alert tone="success">
        Thank you. <strong>{result.data.email}</strong> is confirmed.
      </Alert>
      <div className="mt-6">{next}</div>
    </AuthLayout>
  );
}

function LinkProblem({ code, next }: { code: string; next: ReactNode }) {
  const problem = LINK_PROBLEMS[code]!;
  return (
    <AuthLayout title={problem.title}>
      <Alert tone="warning">{problem.text}</Alert>
      <div className="mt-6">{next}</div>
    </AuthLayout>
  );
}
