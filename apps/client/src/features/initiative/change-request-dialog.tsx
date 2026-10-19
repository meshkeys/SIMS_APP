import {
  type ChangeRequestType,
  createChangeRequestSchema,
  type InitiativeDetail,
  type RequestedChanges,
} from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useSession } from '@/auth/use-auth';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation } from '@/lib/api/query';
import { formatMoney } from '@/lib/format';

const TYPES: { value: ChangeRequestType; label: string; approver: string }[] = [
  {
    value: 'BASELINE_CHANGE',
    label: 'Dates and milestones',
    approver: 'the MD/CEO',
  },
  {
    value: 'BUDGET_CHANGE',
    label: 'Budget',
    approver: 'the executive sponsor',
  },
  { value: 'SCOPE_CHANGE', label: 'Scope', approver: 'the executive sponsor' },
];

interface MilestoneEdit {
  baselineDate: string;
  weight: string;
}

/**
 * Ask for a change to a locked baseline (maker-checker). Values start as the
 * current baseline; only what changes is sent. The server routes it to the
 * approver, who is never the requester.
 */
export function ChangeRequestDialog({
  initiative,
  onClose,
}: {
  initiative: InitiativeDetail;
  onClose: () => void;
}) {
  const { organisation } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [type, setType] = useState<ChangeRequestType>('BASELINE_CHANGE');
  const [start, setStart] = useState(initiative.baseline.start ?? '');
  const [end, setEnd] = useState(initiative.baseline.end ?? '');
  const [budget, setBudget] = useState(
    initiative.budget.baseline === null
      ? ''
      : String(initiative.budget.baseline),
  );
  const [scope, setScope] = useState(initiative.scope ?? '');
  const [milestones, setMilestones] = useState<Record<string, MilestoneEdit>>(
    () =>
      Object.fromEntries(
        initiative.milestones.map((m) => [
          m.id,
          { baselineDate: m.baselineDate, weight: String(m.weight) },
        ]),
      ),
  );
  const [justification, setJustification] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = useApiMutation('createChangeRequest', {
    onSuccess: async (request) => {
      await queryClient.invalidateQueries();
      onClose();
      await navigate({
        to: '/initiatives/$id',
        params: { id: initiative.id },
        search: { tab: 'changes' },
        state: {
          notice: `${request.reference} was sent for approval. You will see the decision here.`,
        },
      });
    },
    onError: (error) => setErrors(error.fieldErrors),
  });

  /** Only the values that differ from today's baseline. */
  const changes = (): RequestedChanges => {
    if (type === 'BUDGET_CHANGE') {
      const next = budget.trim() === '' ? null : Number(budget);
      return next === initiative.budget.baseline
        ? {}
        : { baselineBudget: next };
    }
    if (type === 'SCOPE_CHANGE') {
      const next = scope.trim() || null;
      return next === initiative.scope ? {} : { scope: next };
    }
    const result: RequestedChanges = {};
    if (start !== (initiative.baseline.start ?? ''))
      result.baselineStart = start || null;
    if (end !== (initiative.baseline.end ?? ''))
      result.baselineEnd = end || null;
    const edits = initiative.milestones.flatMap((m) => {
      const edit = milestones[m.id]!;
      const change: NonNullable<RequestedChanges['milestones']>[number] = {
        milestoneId: m.id,
      };
      if (edit.baselineDate !== m.baselineDate)
        change.baselineDate = edit.baselineDate;
      if (Number(edit.weight) !== m.weight) change.weight = Number(edit.weight);
      return Object.keys(change).length > 1 ? [change] : [];
    });
    if (edits.length) result.milestones = edits;
    return result;
  };

  const send = () => {
    const body = {
      type,
      changes: changes(),
      justification,
      dueDate: dueDate || undefined,
    };
    if (Object.keys(body.changes).length === 0) {
      setErrors({ changes: 'Change at least one value.' });
      return;
    }
    const check = createChangeRequestSchema.safeParse(body);
    if (!check.success) {
      setErrors(
        Object.fromEntries(
          check.error.issues.map((i) => [i.path.join('.'), i.message]),
        ),
      );
      return;
    }
    setErrors({});
    submit.mutate({ params: { id: initiative.id }, body });
  };

  const approver = TYPES.find((t) => t.value === type)!.approver;
  const generalError =
    errors.changes ??
    (submit.error && Object.keys(submit.error.fieldErrors).length === 0
      ? errorMessage(submit.error)
      : null);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Request a change to ${initiative.code}`}
      description={`Its baseline is locked. This request goes to ${approver} for approval; once approved, the change is applied and recorded.`}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={submit.isPending} onClick={send}>
            Send for approval
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {generalError && <Alert tone="danger">{generalError}</Alert>}
        <fieldset className="m-0 border-0 p-0">
          <legend className="text-sm font-medium text-ink">
            What needs to change?
          </legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <label
                key={t.value}
                className={
                  type === t.value
                    ? 'flex cursor-pointer items-center justify-center rounded-md border border-primary bg-primary-soft px-3 py-2 text-sm font-medium text-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary'
                    : 'flex cursor-pointer items-center justify-center rounded-md border border-border-strong px-3 py-2 text-sm text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary'
                }
              >
                <input
                  type="radio"
                  name="change-type"
                  value={t.value}
                  checked={type === t.value}
                  onChange={() => {
                    setType(t.value);
                    setErrors({});
                  }}
                  className="sr-only"
                />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>

        {type === 'BASELINE_CHANGE' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Baseline start"
                error={errors['changes.baselineStart']}
              >
                {(c) => (
                  <Input
                    {...c}
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Baseline end" error={errors['changes.baselineEnd']}>
                {(c) => (
                  <Input
                    {...c}
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                )}
              </Field>
            </div>
            {initiative.milestones.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Milestone due dates and weights to change
                  </caption>
                  <thead className="bg-surface-muted text-left text-xs text-ink-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Milestone
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Due
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Weight %
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {initiative.milestones.map((m, index) => {
                      const edit = milestones[m.id]!;
                      const set = (patch: Partial<MilestoneEdit>) =>
                        setMilestones((all) => ({
                          ...all,
                          [m.id]: { ...edit, ...patch },
                        }));
                      return (
                        <tr key={m.id}>
                          <th
                            scope="row"
                            className="px-3 py-2 text-left font-normal text-ink"
                          >
                            {m.title}
                          </th>
                          <td className="px-3 py-2">
                            <Input
                              type="date"
                              aria-label={`Due date for ${m.title}`}
                              value={edit.baselineDate}
                              onChange={(e) =>
                                set({ baselineDate: e.target.value })
                              }
                              aria-invalid={
                                errors[
                                  `changes.milestones.${index}.baselineDate`
                                ]
                                  ? true
                                  : undefined
                              }
                              className="h-9 w-40"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={100}
                              aria-label={`Weight for ${m.title}`}
                              value={edit.weight}
                              onChange={(e) => set({ weight: e.target.value })}
                              className="h-9 w-24"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {type === 'BUDGET_CHANGE' && (
          <Field
            label={`New budget (${organisation.currency})`}
            hint={`Now ${formatMoney(initiative.budget.baseline, organisation.currency)}.`}
            error={errors['changes.baselineBudget']}
          >
            {(c) => (
              <Input
                {...c}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="w-60"
              />
            )}
          </Field>
        )}

        {type === 'SCOPE_CHANGE' && (
          <Field label="New scope" error={errors['changes.scope']}>
            {(c) => (
              <Textarea
                {...c}
                rows={4}
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              />
            )}
          </Field>
        )}

        <Field
          label="Why is the change needed?"
          hint="At least 20 characters. The approver and the audit trail will see this."
          error={errors.justification}
          required
        >
          {(c) => (
            <Textarea
              {...c}
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Decision needed by"
          hint="Defaults to a week from today."
          error={errors.dueDate}
        >
          {(c) => (
            <Input
              {...c}
              type="date"
              className="w-48"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
