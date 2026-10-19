import type { UpdateForm } from '@sims/contracts';
import { useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { formatPercent } from '@/lib/format';
import { HEALTH_DISPLAY } from '@/lib/health';
import { Conversation } from './conversation';
import { EvidenceCell } from './evidence-cell';
import { useApplyForm } from './use-apply-form';

const STAGE: Record<NonNullable<UpdateForm['update']>['status'], string> = {
  DRAFT: 'Draft — not submitted yet',
  SUBMITTED: 'Submitted — waiting for the Strategy Office to verify',
  CHALLENGED: 'Challenged — back with the owner',
  REVIEWED: 'Verified — waiting for the sponsor to confirm',
  APPROVED: 'Approved — locked into the report',
};

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * Reviewing one update: the Strategy Office verifies the claimed figures per
 * milestone (or challenges them); the sponsor confirms (or challenges). Only
 * the actions the server allows this person now are offered.
 */
export function ReviewPanel({ form }: { form: UpdateForm }) {
  const apply = useApplyForm(form);
  const update = form.update;
  const [verified, setVerified] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      form.lines.map((l) => [
        l.milestoneId,
        String(l.verified ?? l.claimed ?? l.lastVerified),
      ]),
    ),
  );
  const [note, setNote] = useState('');
  const [challenging, setChallenging] = useState(false);

  const params = { periodId: form.period.id, initiativeId: form.initiative.id };
  const verify = useApiMutation('verifyUpdate', { onSuccess: apply });
  const approve = useApiMutation('approveUpdate', { onSuccess: apply });
  const error = verify.error ?? approve.error;

  // Verified completion as the reviewer types (weighted like the claim).
  const verifiedCompletion = useMemo(() => {
    const total = form.lines.reduce((s, l) => s + l.weight, 0);
    if (total === 0) return 0;
    const sum = form.lines.reduce((s, l) => {
      const v = l.locked ? 100 : clamp(Number(verified[l.milestoneId]) || 0);
      return s + l.weight * v;
    }, 0);
    return Math.round((sum / total) * 100) / 100;
  }, [form.lines, verified]);

  if (!update) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-ink-muted">
            The owner has not started this update yet.
          </p>
        </CardBody>
      </Card>
    );
  }

  const canVerify = form.can.verify;
  const comment = note.trim() || undefined;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <Alert
          tone={
            update.status === 'CHALLENGED'
              ? 'warning'
              : update.status === 'APPROVED'
                ? 'success'
                : 'info'
          }
        >
          {STAGE[update.status]}
          {update.submittedBy && ` · submitted by ${update.submittedBy.name}`}
        </Alert>
        {error && <Alert tone="danger">{errorMessage(error)}</Alert>}

        <Card aria-labelledby="review-lines-title">
          <CardBody className="pb-3">
            <h2
              id="review-lines-title"
              className="text-base font-semibold text-ink"
            >
              Milestone progress
            </h2>
            {canVerify && (
              <p className="mt-1 text-sm text-ink-muted">
                Enter the completion you can verify for each milestone; it
                starts at the owner’s claim.
              </p>
            )}
          </CardBody>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">
                Claimed and verified completion per milestone
              </caption>
              <thead className="bg-surface-muted text-left text-xs text-ink-muted">
                <tr>
                  <th scope="col" className="px-3 py-2.5 pl-5 font-medium">
                    Milestone
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Weight
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Last verified
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Claimed
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Verified
                  </th>
                  <th scope="col" className="px-3 py-2.5 pr-5 font-medium">
                    Evidence
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {form.lines.map((line) => {
                  const claimed = line.claimed ?? line.lastVerified;
                  const raised = claimed > line.lastVerified;
                  return (
                    <tr key={line.milestoneId}>
                      <th
                        scope="row"
                        className="px-3 py-3 pl-5 text-left font-medium text-ink"
                      >
                        {line.title}
                        {line.note && (
                          <span className="block text-xs font-normal text-ink-muted">
                            “{line.note}”
                          </span>
                        )}
                      </th>
                      <td className="tabular px-3 py-3">
                        {formatPercent(line.weight)}
                      </td>
                      <td className="tabular px-3 py-3 text-ink-muted">
                        {formatPercent(line.lastVerified)}
                      </td>
                      <td
                        className={cn(
                          'tabular px-3 py-3',
                          raised && 'font-semibold text-ink',
                        )}
                      >
                        {formatPercent(claimed)}
                      </td>
                      <td className="px-3 py-3">
                        {line.locked ? (
                          <span className="text-ink-muted">100% · locked</span>
                        ) : canVerify ? (
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={100}
                            aria-label={`Verified completion, ${line.title}`}
                            value={verified[line.milestoneId] ?? ''}
                            onChange={(e) =>
                              setVerified((v) => ({
                                ...v,
                                [line.milestoneId]: e.target.value,
                              }))
                            }
                            className="h-9 w-20"
                          />
                        ) : (
                          <span className="tabular">
                            {line.verified === null
                              ? '—'
                              : formatPercent(line.verified)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 pr-5">
                        <EvidenceCell
                          form={form}
                          line={line}
                          needsEvidence={line.needsEvidence}
                          canUpload={false}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <dl className="grid grid-cols-2 gap-4 border-t border-border bg-surface-muted px-5 py-4 sm:grid-cols-4">
            <Figure
              label="Claimed completion"
              value={formatPercent(update.claimedProgress)}
            />
            <Figure
              label="Planned today"
              value={formatPercent(form.evaluation.plannedCompletion)}
            />
            <Figure
              label="Verified completion"
              value={formatPercent(
                canVerify ? verifiedCompletion : update.verifiedProgress,
              )}
            />
            <div>
              <dt className="text-xs text-ink-muted">Health on the claim</dt>
              <dd className="mt-1">
                {form.evaluation.healthPreview ? (
                  <Badge
                    tone={HEALTH_DISPLAY[form.evaluation.healthPreview].tone}
                  >
                    {HEALTH_DISPLAY[form.evaluation.healthPreview].label}
                  </Badge>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <Card aria-labelledby="review-commentary-title">
          <CardBody className="flex flex-col gap-3 text-sm">
            <h2
              id="review-commentary-title"
              className="text-base font-semibold text-ink"
            >
              The owner’s commentary
            </h2>
            <Commentary
              label="Progress this period"
              text={update.progressNarrative}
            />
            <Commentary
              label="Variance explanation"
              text={update.varianceExplanation}
            />
            <Commentary label="Recovery action" text={update.recoveryAction} />
            <Commentary
              label="Planned for next period"
              text={update.nextSteps}
            />
            {update.needsDecision && (
              <Alert tone="warning">
                The owner needs a management decision to proceed.
              </Alert>
            )}
            {form.risks.length > 0 && (
              <div>
                <h3 className="font-medium text-ink">Open risks and issues</h3>
                <ul className="mt-1 list-disc pl-5 text-ink">
                  {form.risks.map((r) => (
                    <li key={r.id}>
                      {r.title}{' '}
                      <span className="text-ink-muted">
                        ({r.severity.toLowerCase()}{' '}
                        {r.type === 'ISSUE' ? 'issue' : 'risk'})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>

        {(form.can.verify || form.can.approve || form.can.challenge) && (
          <Card aria-labelledby="decision-title">
            <CardBody className="flex flex-col gap-3">
              <h2
                id="decision-title"
                className="text-base font-semibold text-ink"
              >
                Your review
              </h2>
              {(form.can.verify || form.can.approve) && (
                <Field
                  label="Note (optional)"
                  hint="Recorded with your decision."
                >
                  {(c) => (
                    <Textarea
                      {...c}
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  )}
                </Field>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                {form.can.challenge && (
                  <Button
                    variant="secondary"
                    onClick={() => setChallenging(true)}
                  >
                    Challenge
                  </Button>
                )}
                {form.can.verify && (
                  <Button
                    loading={verify.isPending}
                    onClick={() =>
                      verify.mutate({
                        params,
                        body: {
                          lines: form.lines
                            .filter((l) => !l.locked)
                            .map((l) => ({
                              milestoneId: l.milestoneId,
                              verifiedCompletion: clamp(
                                Number(verified[l.milestoneId]) || 0,
                              ),
                            })),
                          comment,
                        },
                      })
                    }
                  >
                    Verify
                  </Button>
                )}
                {form.can.approve && (
                  <Button
                    loading={approve.isPending}
                    onClick={() =>
                      approve.mutate({ params, body: { comment } })
                    }
                  >
                    Confirm and approve
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <Conversation form={form} />
      </aside>

      {challenging && (
        <ChallengeDialog form={form} onClose={() => setChallenging(false)} />
      )}
    </div>
  );
}

function Commentary({ label, text }: { label: string; text: string | null }) {
  return (
    <div>
      <h3 className="font-medium text-ink">{label}</h3>
      <p
        className={cn(
          'mt-0.5 whitespace-pre-line',
          text ? 'text-ink' : 'text-ink-muted',
        )}
      >
        {text ?? 'Not written'}
      </p>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="tabular mt-1 text-2xl font-semibold text-ink">{value}</dd>
    </div>
  );
}

/** Send the update back to its owner, saying what must change. */
function ChallengeDialog({
  form,
  onClose,
}: {
  form: UpdateForm;
  onClose: () => void;
}) {
  const apply = useApplyForm(form);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const challenge = useApiMutation('challengeUpdate', {
    onSuccess: async (next) => {
      await apply(next);
      onClose();
    },
  });
  const send = () => {
    if (comment.trim().length < 10) {
      setError('Explain what needs to change (10+ characters)');
      return;
    }
    setError(null);
    challenge.mutate({
      params: { periodId: form.period.id, initiativeId: form.initiative.id },
      body: { comment: comment.trim() },
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Challenge ${form.initiative.code}`}
      description="The update goes back to its owner with your comment; they change it and submit again."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={challenge.isPending} onClick={send}>
            Send back to owner
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {challenge.error && (
          <Alert tone="danger">{errorMessage(challenge.error)}</Alert>
        )}
        <Field
          label="What needs to change?"
          error={error ?? undefined}
          required
        >
          {(c) => (
            <Textarea
              {...c}
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
