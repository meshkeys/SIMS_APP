import type { OnboardingState } from '@sims/contracts';
import type { FormEvent } from 'react';

/** The wizard's steps, in order (wireframe page 11). */
export const STEPS = [
  {
    key: 'organisation',
    title: 'Organisation',
    note: 'Name, sector, currency',
  },
  {
    key: 'framework',
    title: 'Strategy framework',
    note: 'Your levels and language',
  },
  {
    key: 'vision',
    title: 'Vision & mission',
    note: 'Plan period and statements',
  },
  {
    key: 'governance',
    title: 'Governance defaults',
    note: 'RAG, cycles, escalation',
  },
  { key: 'team', title: 'Invite your team', note: 'Roles and sign-in' },
] as const;
export type StepNumber = 1 | 2 | 3 | 4 | 5;

/** Where to resume: the step after the last one saved. */
export const resumeStep = (state: OnboardingState): StepNumber =>
  Math.min(5, Math.max(1, state.step + 1)) as StepNumber;

/** What to do once a step is saved: go on, or stop for now. */
export type Intent = 'continue' | 'later';

/** Which footer button submitted the form. */
export function intentOf(event: FormEvent): Intent {
  const submitter = (event.nativeEvent as SubmitEvent).submitter;
  return submitter instanceof HTMLButtonElement && submitter.value === 'later'
    ? 'later'
    : 'continue';
}

/** Props every step receives. */
export interface StepProps {
  state: OnboardingState;
  /** Called with the saved state; the wizard moves on or stops. */
  onSaved: (state: OnboardingState, intent: Intent) => void;
  onBack?: () => void;
}

/** "Strategic objective" → "Strategic objectives"; "Priority" → "Priorities". */
export function pluralise(label: string): string {
  const text = label.trim();
  if (/[^aeiou]y$/i.test(text)) return `${text.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(text)) return `${text}es`;
  return `${text}s`;
}

/** "Strategic pillar" → "SP", "Goal" → "G"; always a valid code prefix. */
export function codePrefixFor(label: string): string {
  const initials = label
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
    .join('')
    .replace(/^[0-9]+/, '')
    .slice(0, 5);
  return initials || 'L';
}

/** Field errors from a zod result, keyed by dotted path ("levels.0.label"). */
export function issuesByPath(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.map(String).join('.');
    errors[path] ??= issue.message;
  }
  return errors;
}
