import {
  evaluateUpdate as evaluateShared,
  type UpdateCommentary,
  type UpdateEvaluation,
  type UpdateLineFacts,
} from '@sims/contracts';
import type { RulesetConfig } from '../rulesets/ruleset-config.js';

/**
 * The "Before you submit" rules live in @sims/contracts so the web app can
 * run them live and the server applies the very same code. This adapter
 * passes the organisation's Green threshold from its ruleset.
 */
export type {
  UpdateChecklistItem as ChecklistItem,
  UpdateCommentary,
  UpdateEvaluation,
  UpdateLineFacts,
} from '@sims/contracts';

export function evaluateUpdate(
  lines: readonly UpdateLineFacts[],
  plannedCompletion: number,
  commentary: UpdateCommentary,
  rules: RulesetConfig,
): UpdateEvaluation {
  return evaluateShared(
    lines,
    plannedCompletion,
    commentary,
    rules.rag.greenMaxPpBehind,
  );
}
