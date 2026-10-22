import type { OnboardingState } from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useEffect } from 'react';
import { useAuth } from '@/auth/use-auth';
import { Card } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { refreshSession } from '@/lib/api/client';
import { apiKey, useApiQuery } from '@/lib/api/query';
import { cn } from '@/lib/cn';
import { Brand } from '../auth/auth-layout';
import { EmailReminder } from '../auth/email-reminder';
import { FrameworkStep } from './framework-step';
import { GovernanceStep } from './governance-step';
import { OrganisationStep } from './organisation-step';
import {
  type Intent,
  resumeStep,
  type StepNumber,
  STEPS,
} from './setup-helpers';
import { TeamStep } from './team-step';
import { VisionStep } from './vision-step';

const route = getRouteApi('/setup');

/**
 * Workspace set-up (wireframe page 11): five steps, each saved on its own,
 * resumed where it stopped. New workspaces open here until set-up is done.
 */
export function SetupPage() {
  const state = useApiQuery('getOnboarding', {});
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="bg-sidebar text-sidebar-text">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Brand />
            <span className="hidden text-sm text-sidebar-muted sm:inline">
              · Set up your workspace
            </span>
          </div>
          {state.data && <Progress state={state.data} />}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <EmailReminder />
        {state.isPending ? (
          <>
            <output className="sr-only">Loading your set-up…</output>
            <Skeleton className="h-96" />
          </>
        ) : state.isError ? (
          <Card>
            <ErrorState
              error={state.error}
              onRetry={() => void state.refetch()}
            />
          </Card>
        ) : (
          <Wizard state={state.data} />
        )}
      </main>
    </div>
  );
}

/** The step being shown: the one asked for, never beyond where set-up has got to. */
function useCurrentStep(state: OnboardingState): StepNumber {
  const { step } = route.useSearch();
  const furthest = resumeStep(state);
  return step && step <= furthest ? (step as StepNumber) : furthest;
}

function Progress({ state }: { state: OnboardingState }) {
  const current = useCurrentStep(state);
  return (
    <div className="flex items-center gap-3 text-sm">
      <span>
        Step {current} of {STEPS.length}
      </span>
      <span
        aria-hidden="true"
        className="h-1.5 w-40 overflow-hidden rounded-full bg-white/20"
      >
        <span
          className="block h-full rounded-full bg-white"
          style={{ width: `${(current / STEPS.length) * 100}%` }}
        />
      </span>
    </div>
  );
}

function Wizard({ state }: { state: OnboardingState }) {
  const current = useCurrentStep(state);
  const furthest = resumeStep(state);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();

  const title = STEPS[current - 1]!.title;
  // Each step starts at the top of the page, and names itself in the tab.
  useEffect(() => {
    window.scrollTo?.({ top: 0 });
    document.title = `Set up: ${title} · SIMS`;
  }, [current, title]);

  const goTo = (step: number) =>
    void navigate({ to: '/setup', search: { step } });

  const onSaved = async (next: OnboardingState, intent: Intent) => {
    queryClient.setQueryData(apiKey('getOnboarding', {}), next);
    if (intent === 'later') {
      await signOut();
      await navigate({ to: '/login' });
    } else if (next.status === 'ACTIVE') {
      // The session still says "onboarding" until it is refreshed.
      await refreshSession();
      await navigate({ to: '/strategy' });
    } else {
      goTo(Math.min(current + 1, STEPS.length));
    }
  };
  const props = {
    state,
    onSaved: (next: OnboardingState, intent: Intent) =>
      void onSaved(next, intent),
    onBack: current > 1 ? () => goTo(current - 1) : undefined,
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Set-up steps">
        <ol className="flex flex-col gap-1">
          {STEPS.map((step, index) => {
            const number = index + 1;
            const done = state.step >= number;
            const reachable = number <= furthest;
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium',
                    done
                      ? 'border-primary bg-primary text-white'
                      : number === current
                        ? 'border-primary text-primary'
                        : 'border-border-strong text-ink-muted',
                  )}
                >
                  {done ? <Check className="size-4" /> : number}
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink">
                    {step.title}
                    {done && <span className="sr-only"> (saved)</span>}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {step.note}
                  </span>
                </span>
              </>
            );
            const classes = cn(
              'flex items-center gap-3 rounded-md px-3 py-2',
              number === current && 'bg-surface shadow-card',
            );
            return (
              <li key={step.key}>
                {reachable ? (
                  <Link
                    to="/setup"
                    search={{ step: number }}
                    aria-current={number === current ? 'step' : undefined}
                    className={cn(classes, 'hover:bg-surface')}
                  >
                    {content}
                  </Link>
                ) : (
                  <span className={cn(classes, 'opacity-70')}>{content}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <section aria-labelledby="setup-step-title" className="min-w-0">
        <h1 id="setup-step-title" className="sr-only">
          Set up your workspace, step {current} of {STEPS.length}: {title}
        </h1>
        {current === 1 && <OrganisationStep {...props} />}
        {current === 2 && <FrameworkStep {...props} />}
        {current === 3 && <VisionStep {...props} />}
        {current === 4 && <GovernanceStep {...props} />}
        {current === 5 && <TeamStep {...props} />}
      </section>
    </div>
  );
}
