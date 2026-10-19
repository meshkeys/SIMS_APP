import { type InvitationPreview, ROLE_LABELS } from '@sims/contracts';
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
  INVITATION_NOT_FOUND: {
    title: 'This invitation link is not valid',
    text: 'Check that you opened the whole link from the email, or ask for a new invitation.',
  },
  INVITATION_USED: {
    title: 'This invitation has already been used',
    text: 'If you accepted it, sign in. If it was withdrawn, ask for a new one.',
  },
  INVITATION_EXPIRED: {
    title: 'This invitation has expired',
    text: 'Invitations work for 7 days. Ask the person who invited you to send it again.',
  },
  INVITATION_UNAVAILABLE: {
    title: 'This organisation is not accepting new members',
    text: 'Contact the person who invited you.',
  },
};

/** Where the invitation email links: join the organisation, with a new account or an existing one. */
export function AcceptInvitationPage() {
  const { token } = useSearch({ from: '/accept-invitation' });
  const preview = useApiQuery(
    'lookupInvitation',
    { body: { token: token ?? '' } },
    { enabled: Boolean(token), retry: false, staleTime: Infinity },
  );

  if (!token) {
    return <LinkProblem code="INVITATION_NOT_FOUND" />;
  }
  if (preview.isPending) {
    return (
      <AuthLayout title="Opening your invitation">
        <output className="sr-only">Checking your invitation…</output>
        <Skeleton className="h-64" />
      </AuthLayout>
    );
  }
  if (preview.isError) {
    const code =
      preview.error instanceof ApiError ? preview.error.code : 'UNKNOWN';
    return LINK_PROBLEMS[code] ? (
      <LinkProblem code={code} />
    ) : (
      <AuthLayout title="Your invitation could not be opened">
        <Alert tone="danger">{errorMessage(preview.error)}</Alert>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => void preview.refetch()}
        >
          Try again
        </Button>
      </AuthLayout>
    );
  }
  return <AcceptForm token={token} invitation={preview.data} />;
}

function LinkProblem({ code }: { code: string }) {
  const problem = LINK_PROBLEMS[code]!;
  return (
    <AuthLayout title={problem.title}>
      <Alert tone="warning">{problem.text}</Alert>
      <p className="mt-6 text-sm">
        <Link to="/login" className="font-medium text-primary underline">
          Go to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}

function AcceptForm({
  token,
  invitation,
}: {
  token: string;
  invitation: InvitationPreview;
}) {
  const { session, startSession } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [linkProblem, setLinkProblem] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isNew = !invitation.accountExists;
  const signedInElsewhere =
    session !== null && session.user.email !== invitation.email;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const local: Record<string, string> = {};
    if (isNew && name.trim().length < 2) local.name = 'Enter your name';
    if (!password) local.password = 'Enter a password';
    else if (isNew && password.length < 12)
      local.password = 'Use at least 12 characters';
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;

    setSubmitting(true);
    try {
      startSession(
        await request('acceptInvitation', {
          body: {
            token,
            password,
            ...(isNew ? { name: name.trim() } : {}),
          },
        }),
      );
      await navigate({ to: '/' });
    } catch (error) {
      if (error instanceof ApiError && LINK_PROBLEMS[error.code]) {
        setLinkProblem(error.code);
      } else if (
        error instanceof ApiError &&
        error.code === 'INVALID_CREDENTIALS'
      ) {
        setErrors({
          password: 'That password does not match your SIMS account.',
        });
      } else if (
        error instanceof ApiError &&
        Object.keys(error.fieldErrors).length > 0
      ) {
        setErrors(error.fieldErrors);
      } else {
        setFormError(errorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (linkProblem) return <LinkProblem code={linkProblem} />;

  const expires = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(invitation.expiresAt));

  return (
    <AuthLayout
      title={`Join ${invitation.organisationName}`}
      description={`${invitation.invitedByName} invited you to SIMS.`}
    >
      <dl className="grid gap-3 rounded-md border border-border bg-surface p-4 text-sm">
        <div>
          <dt className="text-xs text-ink-muted">Email</dt>
          <dd className="font-medium text-ink">{invitation.email}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Your roles</dt>
          <dd className="text-ink">
            {invitation.roles.map((role) => ROLE_LABELS[role]).join(', ')}
          </dd>
        </div>
        {invitation.jobTitle && (
          <div>
            <dt className="text-xs text-ink-muted">Job title</dt>
            <dd className="text-ink">{invitation.jobTitle}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-ink-muted">Invitation expires</dt>
          <dd className="text-ink">{expires}</dd>
        </div>
      </dl>

      {signedInElsewhere && (
        <Alert tone="info" className="mt-4">
          You are signed in as {session.user.email}. Accepting signs you in as{' '}
          {invitation.email} instead.
        </Alert>
      )}

      <form
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        className="mt-6 flex flex-col gap-5"
      >
        {formError && <Alert tone="danger">{formError}</Alert>}
        {isNew ? (
          <p className="text-sm text-ink-muted">
            Create your account to accept.
          </p>
        ) : (
          <p className="text-sm text-ink-muted">
            You already use SIMS with this email. Enter your password to add{' '}
            {invitation.organisationName} to your workspaces.
          </p>
        )}
        {/* Lets password managers save the password against the right email. */}
        <input
          type="email"
          autoComplete="username"
          value={invitation.email}
          readOnly
          hidden
        />
        {isNew && (
          <Field label="Your name" error={errors.name} required>
            {(control) => (
              <Input
                {...control}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
        )}
        <Field
          label={isNew ? 'Choose a password' : 'Your password'}
          hint={
            isNew
              ? 'At least 12 characters. A short phrase is easier to remember than symbols.'
              : undefined
          }
          error={errors.password}
          required
        >
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete={isNew ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" size="lg" loading={submitting}>
          {isNew ? 'Create account and join' : 'Sign in and join'}
        </Button>
      </form>
    </AuthLayout>
  );
}
