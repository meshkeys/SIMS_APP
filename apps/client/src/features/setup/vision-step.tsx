import { onboardingVisionSchema } from '@sims/contracts';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/form';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useApiMutation } from '@/lib/api/query';
import { PlanElementsCard } from './plan-elements-card';
import { intentOf, issuesByPath, type StepProps } from './setup-helpers';
import { StepFooter } from './step-footer';

const FORM_ID = 'setup-vision';

/** Step 3: the plan period and statements, and the plan's top levels. */
export function VisionStep({ state, onSaved, onBack }: StepProps) {
  const plan = state.plan;
  const [form, setForm] = useState({
    name: plan?.name ?? '',
    startDate: plan?.startDate ?? '',
    endDate: plan?.endDate ?? '',
    vision: plan?.vision ?? '',
    mission: plan?.mission ?? '',
    values: (plan?.values ?? []).join('\n'),
    aspiration: plan?.aspiration ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useApiMutation('saveOnboardingVision');
  const set = (change: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...change }));

  if (!plan) {
    return (
      <Card>
        <CardBody className="flex flex-col items-start gap-3">
          <Alert tone="info">
            Choose how your strategy is structured first: the plan is created
            from it.
          </Alert>
          {onBack && (
            <Button variant="secondary" onClick={onBack}>
              Back to strategy framework
            </Button>
          )}
        </CardBody>
      </Card>
    );
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const intent = intentOf(event);
    const text = (value: string) => value.trim() || null;
    const parsed = onboardingVisionSchema.safeParse({
      name: form.name,
      startDate: form.startDate,
      endDate: form.endDate,
      vision: text(form.vision),
      mission: text(form.mission),
      values: form.values
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean),
      aspiration: text(form.aspiration),
    });
    if (!parsed.success) {
      setErrors(issuesByPath(parsed.error.issues));
      return;
    }
    setErrors({});
    save.mutate(
      { body: parsed.data },
      {
        onSuccess: (next) => onSaved(next, intent),
        onError: (error) => {
          if (error instanceof ApiError) setErrors(error.fieldErrors);
        },
      },
    );
  };
  const otherError =
    save.isError && Object.keys(errors).length === 0
      ? errorMessage(save.error)
      : null;
  const valuesError = Object.entries(errors).find(([path]) =>
    path.startsWith('values'),
  )?.[1];

  return (
    <div className="flex flex-col gap-6">
      <form id={FORM_ID} noValidate onSubmit={onSubmit}>
        <Card aria-labelledby="vision-title">
          <CardHeader
            titleId="vision-title"
            title="Vision, mission and plan period"
            description="Shown at the top of the strategy map and in board packs."
          />
          <CardBody className="flex flex-col gap-5">
            {otherError && <Alert tone="danger">{otherError}</Alert>}
            <Field label="Plan name" required error={errors.name}>
              {(control) => (
                <Input
                  {...control}
                  value={form.name}
                  maxLength={120}
                  onChange={(e) => set({ name: e.target.value })}
                />
              )}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Starts" required error={errors.startDate}>
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    value={form.startDate}
                    onChange={(e) => set({ startDate: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Ends" required error={errors.endDate}>
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    value={form.endDate}
                    min={form.startDate || undefined}
                    onChange={(e) => set({ endDate: e.target.value })}
                  />
                )}
              </Field>
            </div>
            <Field
              label="Vision"
              hint="Where the organisation is going, in a sentence or two."
              error={errors.vision}
            >
              {(control) => (
                <Textarea
                  {...control}
                  rows={2}
                  maxLength={1000}
                  value={form.vision}
                  onChange={(e) => set({ vision: e.target.value })}
                />
              )}
            </Field>
            <Field
              label="Mission"
              hint="What the organisation does, and for whom."
              error={errors.mission}
            >
              {(control) => (
                <Textarea
                  {...control}
                  rows={2}
                  maxLength={1000}
                  value={form.mission}
                  onChange={(e) => set({ mission: e.target.value })}
                />
              )}
            </Field>
            <Field
              label="Values"
              hint="One per line, e.g. Integrity."
              error={valuesError}
            >
              {(control) => (
                <Textarea
                  {...control}
                  rows={3}
                  value={form.values}
                  onChange={(e) => set({ values: e.target.value })}
                />
              )}
            </Field>
            <Field
              label="Aspiration"
              hint="Optional: the headline ambition for the plan period, e.g. Top-three bank by 2028."
              error={errors.aspiration}
            >
              {(control) => (
                <Textarea
                  {...control}
                  rows={2}
                  maxLength={1000}
                  value={form.aspiration}
                  onChange={(e) => set({ aspiration: e.target.value })}
                />
              )}
            </Field>
          </CardBody>
        </Card>
      </form>

      <PlanElementsCard plan={plan} />

      <StepFooter formId={FORM_ID} saving={save.isPending} onBack={onBack} />
    </div>
  );
}
