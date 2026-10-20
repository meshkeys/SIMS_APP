import type { MapElement, OnboardingState, StrategyMap } from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { errorMessage } from '@/lib/api/errors';
import { apiKey, useApiMutation, useApiQuery } from '@/lib/api/query';

type Plan = NonNullable<OnboardingState['plan']>;

/**
 * The plan's first two levels (e.g. pillars and the objectives under each),
 * added and named right here. Deeper levels, KPIs and owners come later on
 * the strategy map.
 */
export function PlanElementsCard({ plan }: { plan: Plan }) {
  const map = useApiQuery('getStrategyMap', { params: { id: plan.id } });
  const top = plan.levels[0];
  const second = plan.levels[1];

  let body;
  if (map.isPending) {
    body = (
      <>
        <output className="sr-only">Loading your plan…</output>
        <Skeleton className="h-32" />
      </>
    );
  } else if (map.isError) {
    body = <ErrorState error={map.error} onRetry={() => void map.refetch()} />;
  } else {
    body = <ElementTree map={map.data} planId={plan.id} />;
  }

  return (
    <Card aria-labelledby="plan-elements-title">
      <CardHeader
        titleId="plan-elements-title"
        title={`Your ${top?.pluralLabel.toLowerCase() ?? 'strategy'}`}
        description={
          second
            ? `Add your ${top!.pluralLabel.toLowerCase()} and the ${second.pluralLabel.toLowerCase()} under each. Owners, KPIs and deeper levels can be added on the strategy map.`
            : `Add your ${top?.pluralLabel.toLowerCase() ?? 'items'}. Owners and KPIs can be added on the strategy map.`
        }
      />
      <CardBody>{body}</CardBody>
    </Card>
  );
}

function ElementTree({ map, planId }: { map: StrategyMap; planId: string }) {
  const [first, second] = map.levels;
  const roots = map.elements.filter((e) => e.levelId === first?.id);
  const childrenOf = (parentId: string) =>
    map.elements.filter((e) => e.parentId === parentId);

  return (
    <div className="flex flex-col gap-4">
      {roots.length === 0 && (
        <p className="text-sm text-ink-muted">
          No {first?.pluralLabel.toLowerCase()} yet. Add the first one below.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {roots.map((root) => (
          <li
            key={root.id}
            className="rounded-md border border-border bg-surface p-3"
          >
            <ElementItem element={root} />
            {second && (
              <div className="mt-3 flex flex-col gap-2 border-l-2 border-border pl-4">
                <ul className="flex flex-col gap-2">
                  {childrenOf(root.id).map((child) => (
                    <li key={child.id}>
                      <ElementItem element={child} />
                    </li>
                  ))}
                </ul>
                <AddElement
                  planId={planId}
                  parentId={root.id}
                  label={`Add ${second.label.toLowerCase()} to ${root.code}`}
                  placeholder={`New ${second.label.toLowerCase()} under ${root.title}`}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {first && (
        <AddElement
          planId={planId}
          label={`Add ${first.label.toLowerCase()}`}
          placeholder={`New ${first.label.toLowerCase()}, e.g. Revenue Diversification`}
        />
      )}
    </div>
  );
}

function useRefreshPlan() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: apiKey('getStrategyMap') }),
      queryClient.invalidateQueries({ queryKey: apiKey('getOnboarding') }),
    ]);
}

/** One element: its code and title, renamed in place, or removed. */
function ElementItem({ element }: { element: MapElement }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(element.title);
  const refresh = useRefreshPlan();
  const rename = useApiMutation('updateElement', {
    onSuccess: async () => {
      await refresh();
      setEditing(false);
    },
  });
  const remove = useApiMutation('deleteElement', { onSuccess: refresh });
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const error = rename.error ?? remove.error;
  // The Rename button disappears, so keyboard focus moves into the field.
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (title.trim() === element.title) return setEditing(false);
    rename.mutate({
      params: { id: element.id },
      body: { title: title.trim() },
    });
  };

  return (
    <div>
      {editing ? (
        <form onSubmit={onSave} className="flex items-center gap-2">
          <label htmlFor={inputId} className="sr-only">
            New title for {element.code}
          </label>
          <span className="w-12 shrink-0 font-mono text-xs text-ink-muted">
            {element.code}
          </span>
          <Input
            id={inputId}
            value={title}
            ref={input}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button type="submit" size="sm" loading={rename.isPending}>
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setTitle(element.title);
              setEditing(false);
              rename.reset();
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <span className="w-12 shrink-0 font-mono text-xs text-ink-muted">
            {element.code}
          </span>
          <span className="flex-1 text-sm font-medium text-ink">
            {element.title}
          </span>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Rename ${element.title}`}
            onClick={() => setEditing(true)}
          >
            Rename
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Remove ${element.title}`}
            loading={remove.isPending}
            onClick={() => remove.mutate({ params: { id: element.id } })}
          >
            <X />
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {errorMessage(error)}
        </p>
      )}
    </div>
  );
}

/** A one-line "add" form: type a title, press Enter or Add. */
function AddElement({
  planId,
  parentId,
  label,
  placeholder,
}: {
  planId: string;
  parentId?: string;
  label: string;
  placeholder: string;
}) {
  const [title, setTitle] = useState('');
  const refresh = useRefreshPlan();
  const create = useApiMutation('createElement', {
    onSuccess: async () => {
      setTitle('');
      await refresh();
    },
  });
  const inputId = useId();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!title.trim()) return;
    create.mutate({
      params: { id: planId },
      body: { title: title.trim(), ...(parentId ? { parentId } : {}) },
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <Input
          id={inputId}
          value={title}
          maxLength={200}
          placeholder={placeholder}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button
          type="submit"
          variant="secondary"
          loading={create.isPending}
          disabled={!title.trim()}
          aria-label={label}
        >
          <Plus aria-hidden="true" />
          Add
        </Button>
      </div>
      {create.isError && (
        <Alert tone="danger">{errorMessage(create.error)}</Alert>
      )}
    </form>
  );
}
