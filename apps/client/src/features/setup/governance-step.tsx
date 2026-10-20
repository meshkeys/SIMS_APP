import type { RulesetConfig } from '@sims/contracts';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { errorMessage } from '@/lib/api/errors';
import { useApiMutation } from '@/lib/api/query';
import { CycleRules } from '../admin/cycle-rules';
import { EscalationRules } from '../admin/escalation-rules';
import { RagRules } from '../admin/rag-rules';
import { changed, draftErrors } from '../admin/rules-draft';
import { intentOf, type StepProps } from './setup-helpers';
import { StepFooter } from './step-footer';

const FORM_ID = 'setup-governance';

/**
 * Step 4: the starting rules, with the editors Administration uses. Saved
 * directly while setting up; afterwards changes need MD/CEO approval.
 */
export function GovernanceStep({ state, onSaved, onBack }: StepProps) {
  const [draft, setDraft] = useState<RulesetConfig>(() =>
    structuredClone(state.rules),
  );
  const save = useApiMutation('saveOnboardingGovernance');
  const errors = draftErrors(draft);
  const props = {
    draft,
    live: state.rules,
    errors,
    editable: true,
    onChange: (change: (copy: RulesetConfig) => void) =>
      setDraft((d) => changed(d, change)),
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const intent = intentOf(event);
    if (errors.size > 0) return;
    save.mutate(
      { body: { config: draft } },
      { onSuccess: (next) => onSaved(next, intent) },
    );
  };

  return (
    <form
      id={FORM_ID}
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-6"
    >
      <Alert tone="info">
        These defaults follow common practice and can be kept as they are. After
        set-up, changes are proposed by the Strategy Office and approved by the
        MD/CEO.
      </Alert>
      {save.isError && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
      {errors.size > 0 && (
        <Alert tone="warning">
          Some rules need attention before you continue: see the highlighted
          fields.
        </Alert>
      )}
      <RagRules {...props} />
      <EscalationRules {...props} />
      <CycleRules {...props} />
      <StepFooter
        formId={FORM_ID}
        saving={save.isPending}
        onBack={onBack}
        canContinue={errors.size === 0}
      />
    </form>
  );
}
