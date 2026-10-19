import type { UpdateForm } from '@sims/contracts';
import { useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/form';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { formatInstantDate } from '@/lib/format';
import { useApplyForm } from './use-apply-form';

const KIND_LABEL = {
  COMMENT: '',
  CHALLENGE: 'Challenge · ',
  RESPONSE: 'Response · ',
} as const;

/**
 * The conversation on an update: challenges and comments between the owner,
 * the Strategy Office and the sponsor, oldest first, with a reply box for
 * anyone who may comment.
 */
export function Conversation({ form }: { form: UpdateForm }) {
  const { organisation } = useSession();
  const [body, setBody] = useState('');
  const apply = useApplyForm(form);
  const comment = useApiMutation('commentOnUpdate', {
    onSuccess: async (next) => {
      await apply(next);
      setBody('');
    },
  });
  if (form.comments.length === 0 && !form.can.comment) return null;

  return (
    <Card aria-labelledby="conversation-title">
      <CardBody>
        <h2 id="conversation-title" className="font-semibold text-ink">
          Conversation
        </h2>
        {form.comments.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No comments yet.</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-3 text-sm">
            {form.comments.map((c) => (
              <li
                key={c.id}
                className={cn(
                  'rounded-md p-2',
                  c.kind === 'CHALLENGE'
                    ? 'bg-warning-soft'
                    : 'bg-surface-muted',
                )}
              >
                <p className="whitespace-pre-line text-ink">{c.body}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {KIND_LABEL[c.kind]}
                  {c.author?.name ?? 'Someone'} ·{' '}
                  {formatInstantDate(c.at, organisation.timezone)}
                </p>
              </li>
            ))}
          </ol>
        )}
        {form.can.comment && (
          <form
            className="mt-4 flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!body.trim()) return;
              comment.mutate({
                params: {
                  periodId: form.period.id,
                  initiativeId: form.initiative.id,
                },
                body: { body: body.trim() },
              });
            }}
          >
            <Field
              label="Add a comment"
              error={comment.error ? errorMessage(comment.error) : undefined}
            >
              {(c) => (
                <Textarea
                  {...c}
                  rows={2}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              )}
            </Field>
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                loading={comment.isPending}
                disabled={!body.trim()}
              >
                Comment
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
