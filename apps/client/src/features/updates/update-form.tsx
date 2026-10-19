import {
  evaluateUpdate,
  type UpdateDraftInput,
  type UpdateForm as Form,
} from '@sims/contracts';
import { Check, CircleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/form';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { formatInstantDate, formatPercent } from '@/lib/format';
import { HEALTH_DISPLAY } from '@/lib/health';
import { AddRiskDialog } from './add-risk-dialog';
import { Conversation } from './conversation';
import { useApplyForm } from './use-apply-form';

interface Draft {
  /** Claimed % per milestone, as typed ("" = not filled in). */
  claims: Record<string, string>;
  progressNarrative: string;
  varianceExplanation: string;
  recoveryAction: string;
  nextSteps: string;
  needsDecision: boolean;
}

const fromForm = (form: Form): Draft => ({
  claims: Object.fromEntries(
    form.lines.map((l) => [
      l.milestoneId,
      l.claimed === null ? '' : String(l.claimed),
    ]),
  ),
  progressNarrative: form.update?.progressNarrative ?? '',
  varianceExplanation: form.update?.varianceExplanation ?? '',
  recoveryAction: form.update?.recoveryAction ?? '',
  nextSteps: form.update?.nextSteps ?? '',
  needsDecision: form.update?.needsDecision ?? false,
});

const claimOf = (text: string | undefined): number | null => {
  if (text === undefined || text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
};

/**
 * One initiative's monthly update: claims per milestone, commentary, risks.
 * The checklist and completion update live as the owner types, using the
 * same rules the server applies on submit.
 */
export function UpdateForm({ form }: { form: Form }) {
  const { organisation } = useSession();
  const timeZone = organisation.timezone;
  const [draft, setDraft] = useState<Draft>(() => fromForm(form));
  const [dirty, setDirty] = useState(false);
  const [addingRisk, setAddingRisk] = useState(false);
  const editable = form.can.edit;

  // A fresh copy from the server (after save or submit) replaces the draft.
  const [source, setSource] = useState(form);
  if (form !== source) {
    setSource(form);
    setDraft(fromForm(form));
    setDirty(false);
  }

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const change = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const evaluation = useMemo(
    () =>
      evaluateUpdate(
        form.lines.map((l) => ({
          milestoneId: l.milestoneId,
          title: l.title,
          weight: l.weight,
          lastVerified: l.lastVerified,
          claimed: l.locked
            ? l.lastVerified
            : claimOf(draft.claims[l.milestoneId]),
          evidenceRequired: l.evidenceRequired,
          evidenceCount: l.evidenceCount,
        })),
        form.evaluation.plannedCompletion,
        {
          progressNarrative: draft.progressNarrative,
          varianceExplanation: draft.varianceExplanation,
          recoveryAction: draft.recoveryAction,
        },
        form.evaluation.varianceThresholdPp,
      ),
    [form, draft],
  );
  const behind = evaluation.checklist.some(
    (i) => i.key === 'VARIANCE_EXPLANATION',
  );

  const body = (): UpdateDraftInput => ({
    lines: form.lines
      .filter((l) => !l.locked && claimOf(draft.claims[l.milestoneId]) !== null)
      .map((l) => ({
        milestoneId: l.milestoneId,
        claimedCompletion: claimOf(draft.claims[l.milestoneId])!,
      })),
    progressNarrative: draft.progressNarrative.trim() || null,
    varianceExplanation: draft.varianceExplanation.trim() || null,
    recoveryAction: draft.recoveryAction.trim() || null,
    nextSteps: draft.nextSteps.trim() || null,
    needsDecision: draft.needsDecision,
  });

  const params = { periodId: form.period.id, initiativeId: form.initiative.id };
  const onSaved = useApplyForm(form);
  const save = useApiMutation('saveUpdateDraft', { onSuccess: onSaved });
  const submit = useApiMutation('submitUpdate', { onSuccess: onSaved });
  const busy = save.isPending || submit.isPending;
  const error = save.error ?? submit.error;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <StatusBanner form={form} timeZone={timeZone} />
        {error && <Alert tone="danger">{errorMessage(error)}</Alert>}

        <Card aria-labelledby="claims-title">
          <CardBody className="pb-3">
            <h2 id="claims-title" className="text-base font-semibold text-ink">
              1 · Milestone progress
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Enter completion for each milestone. Claims above last month need
              evidence.
            </p>
          </CardBody>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">
                Completion claimed this month per milestone
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
                    This month
                  </th>
                  <th scope="col" className="px-3 py-2.5 pr-5 font-medium">
                    Evidence
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {form.lines.map((line) => {
                  const missing =
                    !line.locked &&
                    claimOf(draft.claims[line.milestoneId]) === null;
                  const needsEvidence = evaluation.needsEvidence.includes(
                    line.milestoneId,
                  );
                  return (
                    <tr key={line.milestoneId}>
                      <th
                        scope="row"
                        className="px-3 py-3 pl-5 text-left font-medium text-ink"
                      >
                        {line.title}
                        {line.isCritical && (
                          <span className="block text-xs font-normal text-ink-muted">
                            Critical
                          </span>
                        )}
                      </th>
                      <td className="tabular px-3 py-3">
                        {formatPercent(line.weight)}
                      </td>
                      <td className="tabular px-3 py-3 text-ink-muted">
                        {formatPercent(line.lastVerified)}
                      </td>
                      <td className="px-3 py-3">
                        {line.locked ? (
                          <span className="tabular text-ink-muted">100%</span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={100}
                              step={1}
                              aria-label={`Completion this month, ${line.title}`}
                              aria-invalid={
                                missing && editable ? true : undefined
                              }
                              disabled={!editable}
                              value={draft.claims[line.milestoneId] ?? ''}
                              onChange={(e) =>
                                change({
                                  claims: {
                                    ...draft.claims,
                                    [line.milestoneId]: e.target.value,
                                  },
                                })
                              }
                              className="h-9 w-20"
                            />
                            <span aria-hidden="true" className="text-ink-muted">
                              %
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 pr-5 text-xs">
                        {line.locked ? (
                          <span className="text-ink-muted">
                            Verified · locked
                          </span>
                        ) : line.evidenceCount > 0 ? (
                          <span className="text-ink-muted">
                            {line.evidenceCount} file
                            {line.evidenceCount === 1 ? '' : 's'} uploaded
                          </span>
                        ) : needsEvidence ? (
                          <span className="font-medium text-danger">
                            Upload required
                          </span>
                        ) : line.evidenceRequired ? (
                          <span className="text-ink-muted">
                            If progress is claimed
                          </span>
                        ) : (
                          <span className="text-ink-muted">Not required</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <dl className="grid grid-cols-2 gap-4 border-t border-border bg-surface-muted px-5 py-4 sm:grid-cols-4">
            <Figure
              label="Calculated completion"
              value={formatPercent(evaluation.claimedCompletion)}
            />
            <Figure
              label="Planned today"
              value={formatPercent(evaluation.plannedCompletion)}
            />
            <Figure
              label="Variance"
              value={`${evaluation.variancePp > 0 ? '+' : ''}${evaluation.variancePp} pp`}
              tone={behind ? 'text-danger' : undefined}
            />
            <div>
              <dt className="text-xs text-ink-muted">Calculated health</dt>
              <dd className="mt-1">
                {form.evaluation.healthPreview ? (
                  <Badge
                    tone={HEALTH_DISPLAY[form.evaluation.healthPreview].tone}
                  >
                    {HEALTH_DISPLAY[form.evaluation.healthPreview].label}
                  </Badge>
                ) : (
                  <span className="text-sm text-ink-muted">—</span>
                )}
                {dirty && (
                  <span className="block text-xs text-ink-muted">
                    updates when saved
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <Card aria-labelledby="commentary-title">
          <CardBody className="flex flex-col gap-4">
            <h2
              id="commentary-title"
              className="text-base font-semibold text-ink"
            >
              2 · Commentary
            </h2>
            {behind && (
              <Alert tone="warning">
                You are more than {form.evaluation.varianceThresholdPp} pp
                behind plan, so a variance explanation and recovery action are
                required.
              </Alert>
            )}
            <Field label="Progress this period" required>
              {(c) => (
                <Textarea
                  {...c}
                  rows={3}
                  placeholder="What was achieved since the last update?"
                  disabled={!editable}
                  value={draft.progressNarrative}
                  onChange={(e) =>
                    change({ progressNarrative: e.target.value })
                  }
                />
              )}
            </Field>
            <Field
              label="Variance explanation"
              hint="Why are we behind, and what is the root cause?"
              required={behind}
            >
              {(c) => (
                <Textarea
                  {...c}
                  rows={3}
                  disabled={!editable}
                  value={draft.varianceExplanation}
                  onChange={(e) =>
                    change({ varianceExplanation: e.target.value })
                  }
                />
              )}
            </Field>
            {(behind || draft.recoveryAction) && (
              <Field
                label="Recovery action"
                hint="What will bring delivery back on plan, and by when?"
                required={behind}
              >
                {(c) => (
                  <Textarea
                    {...c}
                    rows={3}
                    disabled={!editable}
                    value={draft.recoveryAction}
                    onChange={(e) => change({ recoveryAction: e.target.value })}
                  />
                )}
              </Field>
            )}
            <Field label="Planned for next period">
              {(c) => (
                <Textarea
                  {...c}
                  rows={2}
                  disabled={!editable}
                  value={draft.nextSteps}
                  onChange={(e) => change({ nextSteps: e.target.value })}
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <Card aria-labelledby="risks-title">
          <CardBody className="flex flex-col gap-3">
            <h2 id="risks-title" className="text-base font-semibold text-ink">
              3 · Risks, issues & support needed
            </h2>
            {form.risks.length === 0 ? (
              <p className="text-sm text-ink-muted">No open risks or issues.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {form.risks.map((risk) => (
                  <li
                    key={risk.id}
                    className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm"
                  >
                    <Badge
                      tone={
                        risk.severity === 'CRITICAL'
                          ? 'danger'
                          : risk.severity === 'HIGH'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {risk.severity.charAt(0) +
                        risk.severity.slice(1).toLowerCase()}
                    </Badge>
                    <span className="text-ink">{risk.title}</span>
                    <span className="ml-auto text-xs text-ink-muted">
                      {risk.type === 'ISSUE' ? 'Issue' : 'Risk'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {editable && (
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setAddingRisk(true)}
                >
                  Add risk or issue
                </Button>
              </div>
            )}
            <label className="mt-1 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                disabled={!editable}
                checked={draft.needsDecision}
                onChange={(e) => change({ needsDecision: e.target.checked })}
              />
              <span className="text-ink">
                I need a management decision to proceed (adds this to “Decisions
                required”)
              </span>
            </label>
          </CardBody>
        </Card>

        {editable && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!evaluation.canSubmit && (
              <p className="mr-auto text-sm text-ink-muted">
                Complete the checklist to submit; you can save a draft at any
                time.
              </p>
            )}
            <Button
              variant="secondary"
              loading={save.isPending}
              disabled={busy}
              onClick={() => save.mutate({ params, body: body() })}
            >
              Save draft
            </Button>
            <Button
              loading={submit.isPending}
              disabled={busy || !evaluation.canSubmit}
              onClick={() => submit.mutate({ params, body: body() })}
            >
              Submit for review
            </Button>
          </div>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <Card aria-labelledby="checklist-title">
          <CardBody>
            <h2 id="checklist-title" className="font-semibold text-ink">
              Before you submit
            </h2>
            <ul
              className="mt-3 flex flex-col gap-2.5 text-sm"
              aria-live="polite"
            >
              {evaluation.checklist.map((item) => (
                <li key={item.key} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full',
                      item.ok
                        ? 'bg-success-soft text-success'
                        : item.blocking
                          ? 'bg-danger-soft text-danger'
                          : 'bg-warning-soft text-warning',
                    )}
                  >
                    {item.ok ? (
                      <Check className="size-3" />
                    ) : (
                      <CircleAlert className="size-3" />
                    )}
                  </span>
                  <span className="text-ink">
                    <span className="sr-only">
                      {item.ok
                        ? 'Done: '
                        : item.blocking
                          ? 'To do: '
                          : 'Recommended: '}
                    </span>
                    {item.ok && item.key === 'NARRATIVE'
                      ? 'Progress described'
                      : item.ok && item.key === 'VARIANCE_EXPLANATION'
                        ? 'Variance explanation written'
                        : item.ok && item.key === 'RECOVERY_ACTION'
                          ? 'Recovery action described'
                          : item.message}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card aria-labelledby="next-title">
          <CardBody>
            <h2 id="next-title" className="font-semibold text-ink">
              What happens next
            </h2>
            <ol className="mt-3 flex flex-col gap-2 text-sm text-ink">
              <li>
                The Strategy Office reviews and may challenge your figures.
              </li>
              <li>Your sponsor confirms the status.</li>
              <li>It is locked into the management report.</li>
            </ol>
            {form.period.submissionDueAt && (
              <p className="mt-3 text-xs text-ink-muted">
                Due {formatInstantDate(form.period.submissionDueAt, timeZone)}.
              </p>
            )}
          </CardBody>
        </Card>
        <Conversation form={form} />
      </aside>

      {addingRisk && (
        <AddRiskDialog
          initiativeId={form.initiative.id}
          initiativeCode={form.initiative.code}
          onClose={() => setAddingRisk(false)}
        />
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className={cn('tabular mt-1 text-2xl font-semibold text-ink', tone)}>
        {value}
      </dd>
    </div>
  );
}

/** Where the update stands, in words. */
function StatusBanner({ form, timeZone }: { form: Form; timeZone: string }) {
  const update = form.update;
  if (form.period.locked) {
    return (
      <Alert tone="info" title="This period is locked">
        Its figures are part of the management report.
      </Alert>
    );
  }
  if (!update) return null;
  switch (update.status) {
    case 'DRAFT':
      return (
        <p className="text-sm text-ink-muted">
          Draft saved {formatInstantDate(update.savedAt, timeZone)}. Only you
          and the Strategy Office can see it.
        </p>
      );
    case 'SUBMITTED':
      return (
        <Alert
          tone="info"
          title="Submitted — waiting for the Strategy Office to verify"
        >
          {update.submittedAt &&
            `Sent ${formatInstantDate(update.submittedAt, timeZone)}.`}
        </Alert>
      );
    case 'CHALLENGED': {
      const challenge = [...form.comments]
        .reverse()
        .find((c) => c.kind === 'CHALLENGE');
      return (
        <Alert
          tone="warning"
          title="The Strategy Office challenged this update"
        >
          {challenge ? `“${challenge.body}” ` : ''}Change it and submit again.
        </Alert>
      );
    }
    case 'REVIEWED':
      return (
        <Alert
          tone="info"
          title="Verified — waiting for your sponsor to confirm"
        >
          Verified completion: {formatPercent(update.verifiedProgress)}.
        </Alert>
      );
    case 'APPROVED':
      return (
        <Alert tone="success" title="Approved">
          Verified completion {formatPercent(update.verifiedProgress)}
          {update.approvedAt &&
            `, confirmed ${formatInstantDate(update.approvedAt, timeZone)}`}
          .
        </Alert>
      );
  }
}
