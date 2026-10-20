import {
  type FrameworkTemplate,
  type FrameworkTemplateView,
  MAX_FRAMEWORK_LEVELS,
  type OnboardingState,
  onboardingFrameworkSchema,
} from '@sims/contracts';
import { Plus, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useApiMutation, useApiQuery } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { CustomFieldsCard } from './custom-fields-card';
import { FrameworkPreview } from './framework-preview';
import {
  codePrefixFor,
  intentOf,
  issuesByPath,
  pluralise,
  type StepProps,
} from './setup-helpers';
import { StepFooter } from './step-footer';

const FORM_ID = 'setup-framework';

export interface DraftLevel {
  /** React key; the level's id once saved. */
  key: string;
  id?: string;
  label: string;
  pluralLabel: string;
  codePrefix: string;
  allowsKpis: boolean;
}
type Terms = OnboardingState['organisation']['terminology'];

const TERM_ROWS = [
  { key: 'kpi', name: 'KPIs', kind: 'Measure', tone: 'warning' },
  { key: 'initiative', name: 'Initiatives', kind: 'Delivery', tone: 'success' },
  { key: 'milestone', name: 'Milestones', kind: 'Tracking', tone: 'neutral' },
  { key: 'task', name: 'Tasks', kind: 'Tracking', tone: 'neutral' },
] as const;

let nextKey = 0;
const newKey = () => `new-${++nextKey}`;

const fromTemplate = (template: FrameworkTemplateView): DraftLevel[] =>
  template.levels.map((level) => ({ ...level, key: newKey() }));

const fromPlan = (plan: NonNullable<OnboardingState['plan']>): DraftLevel[] =>
  plan.levels.map((level) => ({
    key: level.id,
    id: level.id,
    label: level.label,
    pluralLabel: level.pluralLabel,
    codePrefix: level.codePrefix ?? codePrefixFor(level.label),
    allowsKpis: level.allowsKpis,
  }));

/** What we suggest first, by sector. */
const recommendedFor = (
  sector: OnboardingState['organisation']['sector'],
): { template: FrameworkTemplate; note: string } =>
  sector === 'PUBLIC'
    ? {
        template: 'PUBLIC_SECTOR_RESULTS',
        note: 'Recommended for government and public bodies',
      }
    : sector === 'NON_PROFIT'
      ? {
          template: 'BALANCED_SCORECARD',
          note: 'Recommended for non-profit organisations',
        }
      : {
          template: 'STRATEGIC_PILLARS',
          note: 'Recommended for private companies',
        };

/** Step 2: "How is your strategy structured?" */
export function FrameworkStep(props: StepProps) {
  const templates = useApiQuery('listFrameworkTemplates', {});
  if (templates.isPending) {
    return (
      <>
        <output className="sr-only">Loading frameworks…</output>
        <Skeleton className="h-96" />
      </>
    );
  }
  if (templates.isError) {
    return (
      <Card>
        <ErrorState
          error={templates.error}
          onRetry={() => void templates.refetch()}
        />
      </Card>
    );
  }
  return <FrameworkForm {...props} templates={templates.data} />;
}

function FrameworkForm({
  state,
  onSaved,
  onBack,
  templates,
}: StepProps & { templates: FrameworkTemplateView[] }) {
  const plan = state.plan;
  const recommended = recommendedFor(state.organisation.sector);
  const [template, setTemplate] = useState<FrameworkTemplate>(
    plan?.template ?? recommended.template,
  );
  const [levels, setLevels] = useState<DraftLevel[]>(() =>
    plan
      ? fromPlan(plan)
      : fromTemplate(templates.find((t) => t.key === template)!),
  );
  const [terms, setTerms] = useState<Terms>(state.organisation.terminology);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useApiMutation('saveOnboardingFramework');

  const choose = (key: FrameworkTemplate) => {
    setTemplate(key);
    setErrors({});
    setLevels(
      plan && plan.template === key
        ? fromPlan(plan)
        : fromTemplate(templates.find((t) => t.key === key)!),
    );
  };
  const changeLevel = (index: number, label: string) =>
    setLevels((all) =>
      all.map((level, i) =>
        i === index
          ? {
              ...level,
              label,
              pluralLabel: pluralise(label),
              // Saved levels keep their prefix, so existing codes stay meaningful.
              codePrefix: level.id ? level.codePrefix : codePrefixFor(label),
            }
          : level,
      ),
    );
  const restarting =
    plan !== null && plan.template !== template && plan.elementCount > 0;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const intent = intentOf(event);
    const body = {
      template,
      // Ids only make sense for the plan's own template.
      levels: levels.map(({ key: _key, id, ...level }) =>
        plan?.template === template && id ? { id, ...level } : level,
      ),
      terminology: terms,
    };
    const parsed = onboardingFrameworkSchema.safeParse(body);
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
  const chosen = templates.find((t) => t.key === template)!;

  return (
    <form
      id={FORM_ID}
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-6"
    >
      <Card aria-labelledby="framework-title">
        <CardHeader
          titleId="framework-title"
          title="How is your strategy structured?"
          description="Start from a framework, then rename, add or remove levels so SIMS speaks your organisation's language."
        />
        <CardBody>
          <fieldset>
            <legend className="sr-only">Starting framework</legend>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {templates.map((option) => {
                const selected = option.key === template;
                return (
                  <label
                    key={option.key}
                    className={cn(
                      'flex cursor-pointer flex-col gap-1 rounded-card border p-4 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-primary',
                      selected
                        ? 'border-2 border-primary bg-primary-soft'
                        : 'border-border bg-surface hover:border-ink-subtle',
                    )}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={option.key}
                      checked={selected}
                      onChange={() => choose(option.key)}
                      className="sr-only"
                    />
                    <span className="text-sm font-semibold text-ink">
                      {option.name}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {option.description}
                    </span>
                    {option.key === recommended.template && (
                      <Badge
                        tone="success"
                        className="mt-2 self-start whitespace-normal"
                      >
                        {recommended.note}
                      </Badge>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
          {restarting && (
            <Alert tone="warning" className="mt-4">
              Choosing {chosen.name} starts the levels again and removes the{' '}
              {plural(plan.elementCount, 'item')} already in your plan.
            </Alert>
          )}
          {chosen.starterElements.length > 0 && plan?.template !== template && (
            <p className="mt-4 text-sm text-ink-muted">
              Starts with {chosen.starterElements.join(', ')}.
            </p>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card aria-labelledby="levels-title">
          <CardHeader
            titleId="levels-title"
            title="Name your levels"
            description="These names appear on the strategy map, reports and notifications."
          />
          <CardBody className="flex flex-col gap-3">
            {otherError && <Alert tone="danger">{otherError}</Alert>}
            {levels.map((level, index) => (
              <LevelRow
                key={level.key}
                number={index + 1}
                value={level.label}
                kind="Strategy"
                tone="info"
                error={errors[`levels.${index}.label`]}
                onChange={(label) => changeLevel(index, label)}
                onRemove={
                  levels.length > 1
                    ? () =>
                        setLevels((all) => all.filter((_, i) => i !== index))
                    : undefined
                }
              />
            ))}
            {TERM_ROWS.map((row, index) => (
              <LevelRow
                key={row.key}
                number={levels.length + index + 1}
                value={terms[row.key]}
                kind={row.kind}
                tone={row.tone}
                label={`What you call ${row.name}`}
                error={errors[`terminology.${row.key}`]}
                onChange={(value) =>
                  setTerms((t) => ({ ...t, [row.key]: value }))
                }
              />
            ))}
            {errors.levels && (
              <p className="text-sm text-danger">{errors.levels}</p>
            )}
            <Button
              variant="secondary"
              className="self-start"
              disabled={levels.length >= MAX_FRAMEWORK_LEVELS}
              onClick={() =>
                setLevels((all) => [
                  ...all,
                  {
                    key: newKey(),
                    label: '',
                    pluralLabel: '',
                    codePrefix: 'L',
                    allowsKpis: true,
                  },
                ])
              }
            >
              <Plus aria-hidden="true" />
              Add a strategy level
            </Button>
            <div className="mt-2 border-t border-border pt-3 text-xs text-ink-muted">
              <p>
                <strong className="text-primary">Strategy</strong> levels
                describe direction. You can have 1 to {MAX_FRAMEWORK_LEVELS}.
              </p>
              <p>
                <strong className="text-warning">Measure</strong> holds
                baselines, targets and actuals (strategic impact).
              </p>
              <p>
                <strong className="text-success">Delivery</strong> and{' '}
                <strong className="text-ink">Tracking</strong> drive execution
                progress and RAG status.
              </p>
            </div>
          </CardBody>
        </Card>
        <FrameworkPreview
          levels={levels}
          terms={terms}
          vision={plan?.vision ?? null}
        />
      </div>

      <CustomFieldsCard fields={state.customFields} />

      <StepFooter formId={FORM_ID} saving={save.isPending} onBack={onBack} />
    </form>
  );
}

function LevelRow({
  number,
  value,
  kind,
  tone,
  label,
  error,
  onChange,
  onRemove,
}: {
  number: number;
  value: string;
  kind: string;
  tone: 'info' | 'warning' | 'success' | 'neutral';
  label?: string;
  error?: string;
  onChange: (value: string) => void;
  onRemove?: () => void;
}) {
  const id = `level-${number}`;
  const name = label ?? `Level ${number} name`;
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-md border border-border p-3',
        kind === 'Strategy' ? 'bg-surface' : 'bg-surface-muted',
      )}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="w-4 text-xs text-ink-subtle">
          {number}
        </span>
        <label htmlFor={id} className="sr-only">
          {name}
        </label>
        <Input
          id={id}
          value={value}
          maxLength={60}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <Badge tone={tone}>{kind}</Badge>
        {onRemove ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${value || `level ${number}`}`}
            onClick={onRemove}
          >
            <X />
          </Button>
        ) : (
          <span className="size-9 shrink-0" />
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="pl-7 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
