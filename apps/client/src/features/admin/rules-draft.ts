import { type RulesetConfig, rulesetConfigSchema } from '@sims/contracts';

/** Field errors of a draft, keyed by path ("rag.amberMaxPpBehind"), from the shared schema. */
export function draftErrors(draft: RulesetConfig): Map<string, string> {
  const result = rulesetConfigSchema.safeParse(draft);
  const errors = new Map<string, string>();
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      if (!errors.has(path)) errors.set(path, issue.message);
    }
  }
  return errors;
}

/** A changed copy of the draft (the draft itself is never mutated). */
export function changed(
  draft: RulesetConfig,
  change: (copy: RulesetConfig) => void,
): RulesetConfig {
  const copy = structuredClone(draft);
  change(copy);
  return copy;
}

/** Props every rules section receives. */
export interface RulesSectionProps {
  draft: RulesetConfig;
  live: RulesetConfig;
  onChange: (change: (copy: RulesetConfig) => void) => void;
  errors: Map<string, string>;
  /** False while a proposal waits, or for readers such as the MD/CEO. */
  editable: boolean;
}
