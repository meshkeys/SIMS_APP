import { type InvitationView, ROLE_LABELS, type Role } from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useApiMutation, useApiQuery } from '@/lib/api/query';
import { formatInstantDate } from '@/lib/format';
import { DepartmentSelect, RoleChoices } from './member-dialogs';

export interface Notice {
  tone: 'success' | 'warning';
  text: string;
}

export function InviteDialog({
  canManageAdmins,
  onClose,
  onSent,
}: {
  canManageAdmins: boolean;
  onClose: () => void;
  onSent: (notice: Notice) => void;
}) {
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [jobTitle, setJobTitle] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [tried, setTried] = useState(false);
  const queryClient = useQueryClient();
  const invite = useApiMutation('createInvitation', {
    onSuccess: async (sent) => {
      await queryClient.invalidateQueries();
      onSent(
        sent.emailDelivered
          ? { tone: 'success', text: `Invitation sent to ${sent.email}.` }
          : {
              tone: 'warning',
              text: `The invitation to ${sent.email} was created, but the email could not be sent. Use Resend once email is working.`,
            },
      );
    },
  });
  const fieldErrors =
    invite.error instanceof ApiError ? invite.error.fieldErrors : {};
  const otherError =
    invite.isError && Object.keys(fieldErrors).length === 0
      ? errorMessage(invite.error)
      : null;
  const emailError =
    fieldErrors.email ??
    (tried && !email.trim() ? 'Enter their work email' : undefined);
  const rolesError =
    fieldErrors.roles ??
    (tried && roles.length === 0 ? 'Choose at least one role' : undefined);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!email.trim() || roles.length === 0) return;
    invite.mutate({
      body: {
        email: email.trim(),
        roles,
        jobTitle: jobTitle.trim() || undefined,
        departmentId: departmentId || undefined,
      },
    });
  };

  const formId = 'invite-form';
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Invite someone"
      description="They get an email with a link to join. The link works for 7 days."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={invite.isPending}>
            Send invitation
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-4"
      >
        {otherError && <Alert tone="danger">{otherError}</Alert>}
        <Field label="Work email" required error={emailError}>
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <RoleChoices
          value={roles}
          onChange={setRoles}
          canManageAdmins={canManageAdmins}
          error={rolesError}
        />
        <Field label="Job title" error={fieldErrors.jobTitle}>
          {(control) => (
            <Input
              {...control}
              value={jobTitle}
              maxLength={120}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          )}
        </Field>
        <DepartmentSelect
          value={departmentId}
          onChange={setDepartmentId}
          error={fieldErrors.departmentId}
        />
      </form>
    </Dialog>
  );
}

/** Invitations not yet accepted: resend a fresh link, or revoke. */
export function PendingInvitations({
  onNotice,
}: {
  onNotice: (notice: Notice) => void;
}) {
  const invitations = useApiQuery('listInvitations', {});
  const open = (invitations.data ?? []).filter(
    (i) => i.status === 'PENDING' || i.status === 'EXPIRED',
  );
  if (invitations.isPending) {
    return (
      <>
        <output className="sr-only">Loading invitations…</output>
        <Skeleton className="h-24" />
      </>
    );
  }
  if (invitations.isError) {
    return (
      <Card>
        <ErrorState
          title="Invitations could not be loaded"
          error={invitations.error}
          onRetry={() => void invitations.refetch()}
        />
      </Card>
    );
  }
  if (open.length === 0) return null;
  return (
    <Card aria-labelledby="invitations-title">
      <CardHeader
        titleId="invitations-title"
        title="Invitations waiting"
        description="People invited who have not joined yet."
      />
      <ul className="divide-y divide-border px-5 pb-2">
        {open.map((invitation) => (
          <InvitationRow
            key={invitation.id}
            invitation={invitation}
            onNotice={onNotice}
          />
        ))}
      </ul>
    </Card>
  );
}

function InvitationRow({
  invitation,
  onNotice,
}: {
  invitation: InvitationView;
  onNotice: (notice: Notice) => void;
}) {
  const { organisation } = useSession();
  const queryClient = useQueryClient();
  const resend = useApiMutation('resendInvitation', {
    onSuccess: async (sent) => {
      await queryClient.invalidateQueries();
      onNotice(
        sent.emailDelivered
          ? { tone: 'success', text: `A new link was sent to ${sent.email}.` }
          : {
              tone: 'warning',
              text: `A new link was made for ${sent.email}, but the email could not be sent.`,
            },
      );
    },
  });
  const revoke = useApiMutation('revokeInvitation', {
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      onNotice({
        tone: 'success',
        text: `The invitation to ${invitation.email} was revoked.`,
      });
    },
  });
  const failed = resend.error ?? revoke.error;
  const expired = invitation.status === 'EXPIRED';
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
          {invitation.email}
          {expired && <Badge tone="warning">Expired</Badge>}
        </p>
        <p className="text-xs text-ink-muted">
          {invitation.roles.map((r) => ROLE_LABELS[r]).join(', ')} · invited by{' '}
          {invitation.invitedBy.name} · {expired ? 'expired' : 'expires'}{' '}
          {formatInstantDate(invitation.expiresAt, organisation.timezone)}
        </p>
        {failed && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {errorMessage(failed)}
          </p>
        )}
      </div>
      <div className="flex gap-1">
        <Button
          variant="secondary"
          size="sm"
          loading={resend.isPending}
          aria-label={`Resend the invitation to ${invitation.email}`}
          onClick={() => resend.mutate({ params: { id: invitation.id } })}
        >
          Resend
        </Button>
        {!expired && (
          <Button
            variant="ghost"
            size="sm"
            loading={revoke.isPending}
            aria-label={`Revoke the invitation to ${invitation.email}`}
            onClick={() => revoke.mutate({ params: { id: invitation.id } })}
          >
            Revoke
          </Button>
        )}
      </div>
    </li>
  );
}
