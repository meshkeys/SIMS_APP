import type { Role } from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { apiKey, useApiMutation } from '@/lib/api/query';
import { hasAnyRole } from '@/lib/access';
import { type Notice, PendingInvitations } from '../admin/invitations';
import { RoleChoices } from '../admin/member-dialogs';
import { intentOf, type StepProps } from './setup-helpers';
import { StepFooter } from './step-footer';

const FORM_ID = 'setup-team';

/**
 * Step 5: invite the people who will use SIMS (optional), then finish.
 * Invitations go out at once; finishing makes the workspace active.
 */
export function TeamStep({ state, onSaved, onBack }: StepProps) {
  const session = useSession();
  const [notice, setNotice] = useState<Notice | null>(null);
  const complete = useApiMutation('completeOnboarding');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const intent = intentOf(event);
    // Nothing to save here: invitations are sent as they are made.
    if (intent === 'later') return onSaved(state, 'later');
    complete.mutate({}, { onSuccess: (next) => onSaved(next, 'continue') });
  };

  return (
    <div className="flex flex-col gap-6">
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <InviteForm
        canManageAdmins={hasAnyRole(session, ['SYSTEM_ADMIN'])}
        onNotice={setNotice}
      />
      <PendingInvitations onNotice={setNotice} />

      <form id={FORM_ID} noValidate onSubmit={onSubmit}>
        <Card>
          <CardBody className="flex flex-col gap-2">
            <p className="text-sm text-ink">
              {state.invitations.pending > 0
                ? `${state.invitations.pending} invitation${state.invitations.pending === 1 ? '' : 's'} waiting. People can join before or after you finish.`
                : 'You can also invite people later, from Administration.'}
            </p>
            <p className="text-sm text-ink-muted">
              Finishing opens your workspace: the strategy map, initiatives and
              reporting cycles. Everything you set here can still be changed.
            </p>
            {complete.isError && (
              <Alert tone="danger">{errorMessage(complete.error)}</Alert>
            )}
            {!state.canComplete && (
              <Alert tone="warning">
                Choose how your strategy is structured before finishing.
              </Alert>
            )}
          </CardBody>
        </Card>
      </form>
      <StepFooter
        formId={FORM_ID}
        saving={complete.isPending}
        onBack={onBack}
        continueLabel="Finish set-up"
        canContinue={state.canComplete}
      />
    </div>
  );
}

const SUGGESTED: Role[] = ['INITIATIVE_OWNER'];

/** One invitation at a time: email and roles. */
function InviteForm({
  canManageAdmins,
  onNotice,
}: {
  canManageAdmins: boolean;
  onNotice: (notice: Notice) => void;
}) {
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<Role[]>(SUGGESTED);
  const [tried, setTried] = useState(false);
  const queryClient = useQueryClient();
  const invite = useApiMutation('createInvitation', {
    onSuccess: async (sent) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiKey('listInvitations') }),
        queryClient.invalidateQueries({ queryKey: apiKey('getOnboarding') }),
      ]);
      setEmail('');
      setTried(false);
      onNotice(
        sent.emailDelivered
          ? { tone: 'success', text: `Invitation sent to ${sent.email}.` }
          : {
              tone: 'warning',
              text: `The invitation to ${sent.email} was created, but the email could not be sent. Resend it once email is working.`,
            },
      );
    },
  });
  const fieldErrors =
    invite.error instanceof ApiError ? invite.error.fieldErrors : {};
  const emailError =
    fieldErrors.email ??
    (tried && !email.trim() ? 'Enter their work email' : undefined);
  const rolesError =
    fieldErrors.roles ??
    (tried && roles.length === 0 ? 'Choose at least one role' : undefined);
  const otherError =
    invite.isError && Object.keys(fieldErrors).length === 0
      ? errorMessage(invite.error)
      : null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!email.trim() || roles.length === 0) return;
    invite.mutate({ body: { email: email.trim(), roles } });
  };

  return (
    <Card aria-labelledby="invite-title">
      <CardHeader
        titleId="invite-title"
        title="Invite your team"
        description="Each person gets an email with a link to join. Roles decide what they see and do; you can change them later."
      />
      <CardBody>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
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
          <Button
            type="submit"
            variant="secondary"
            className="self-start"
            loading={invite.isPending}
          >
            Send invitation
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
