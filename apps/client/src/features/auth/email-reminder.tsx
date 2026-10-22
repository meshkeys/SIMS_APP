import { MailWarning } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/auth/use-auth';
import { Button } from '@/components/ui/button';
import { refreshSession } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useApiMutation } from '@/lib/api/query';

/**
 * Shown until the signed-in person confirms their email address: where the
 * link went, and a way to send it again. Everything else keeps working.
 */
export function EmailReminder() {
  const { session } = useAuth();
  const [sent, setSent] = useState(false);
  const resend = useApiMutation('resendVerificationEmail', {
    onSuccess: () => setSent(true),
    onError: (error) => {
      // Confirmed in another tab: refresh, and the reminder goes away.
      if (error instanceof ApiError && error.code === 'ALREADY_VERIFIED') {
        void refreshSession();
      }
    },
  });
  if (!session || session.user.emailVerified) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-warning-soft bg-warning-soft px-4 py-3 text-sm text-warning">
      <MailWarning aria-hidden="true" className="size-4 shrink-0" />
      {/* Announced when it changes, e.g. once a new link is sent. */}
      <output className="block min-w-0 flex-1">
        {sent ? (
          <>
            A new link is on its way to <strong>{session.user.email}</strong>.
            Check your inbox and spam folder.
          </>
        ) : (
          <>
            Confirm your email address: we sent a link to{' '}
            <strong>{session.user.email}</strong>.
          </>
        )}
        {resend.isError && (
          <span className="mt-1 block">{errorMessage(resend.error)}</span>
        )}
      </output>
      {!sent && (
        <Button
          size="sm"
          variant="secondary"
          loading={resend.isPending}
          onClick={() => resend.mutate({})}
        >
          Send the link again
        </Button>
      )}
    </div>
  );
}
