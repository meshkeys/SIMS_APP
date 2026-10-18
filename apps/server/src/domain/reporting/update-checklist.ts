import { verifiedCompletion } from '../delivery/progress.js';
import type { RulesetConfig } from '../rulesets/ruleset-config.js';

export interface UpdateLineFacts {
  milestoneId: string;
  title: string;
  weight: number;
  /** Last verified completion (locked for completed milestones). */
  lastVerified: number;
  /** This month's claim; null while not filled in. */
  claimed: number | null;
  evidenceRequired: boolean;
  evidenceCount: number;
}

export interface UpdateCommentary {
  progressNarrative: string | null;
  varianceExplanation: string | null;
  recoveryAction: string | null;
}

export interface ChecklistItem {
  key:
    | 'ALL_MILESTONES'
    | 'EVIDENCE'
    | 'VARIANCE_EXPLANATION'
    | 'RECOVERY_ACTION'
    | 'NARRATIVE';
  ok: boolean;
  /** Blocking items must be fixed before submitting. */
  blocking: boolean;
  message: string;
  /** Milestones the item is about, if any. */
  milestoneIds?: string[];
}

export interface UpdateEvaluation {
  /** Weighted completion from the claims (missing claims count as last verified). */
  claimedCompletion: number;
  plannedCompletion: number;
  /** Claimed minus planned, in percentage points. */
  variancePp: number;
  /** Milestones whose claim rose above the last verified figure and need evidence. */
  needsEvidence: string[];
  checklist: ChecklistItem[];
  canSubmit: boolean;
}

const filled = (text: string | null) => !!text && text.trim().length >= 10;

/**
 * The "Before you submit" panel. Pure, so the form can show it live and the
 * server applies the same rules on submit.
 *
 * Evidence is reported but not yet blocking: uploads arrive with the
 * documents module, after which it becomes blocking.
 */
export function evaluateUpdate(
  lines: readonly UpdateLineFacts[],
  plannedCompletion: number,
  commentary: UpdateCommentary,
  rules: RulesetConfig,
): UpdateEvaluation {
  const claimedCompletion = verifiedCompletion(
    lines.map((line) => ({
      weight: line.weight,
      verifiedCompletion: line.claimed ?? line.lastVerified,
      baselineStartDate: null,
      baselineDate: new Date(0),
    })),
  );
  const variancePp =
    Math.round((claimedCompletion - plannedCompletion) * 10) / 10;
  const behind = -variancePp > rules.rag.greenMaxPpBehind;

  const missing = lines.filter((line) => line.claimed === null);
  const needsEvidence = lines
    .filter(
      (line) =>
        line.evidenceRequired &&
        line.claimed !== null &&
        line.claimed > line.lastVerified &&
        line.evidenceCount === 0,
    )
    .map((line) => line.milestoneId);

  const checklist: ChecklistItem[] = [
    {
      key: 'ALL_MILESTONES',
      ok: missing.length === 0,
      blocking: true,
      message:
        missing.length === 0
          ? 'All milestones have a completion value'
          : `Enter completion for: ${missing.map((l) => l.title).join(', ')}`,
      milestoneIds: missing.map((l) => l.milestoneId),
    },
    {
      key: 'EVIDENCE',
      ok: needsEvidence.length === 0,
      blocking: false,
      message:
        needsEvidence.length === 0
          ? 'Evidence attached where progress was claimed'
          : `Evidence needed for: ${lines
              .filter((l) => needsEvidence.includes(l.milestoneId))
              .map((l) => l.title)
              .join(', ')}`,
      milestoneIds: needsEvidence,
    },
    {
      key: 'NARRATIVE',
      ok: filled(commentary.progressNarrative),
      blocking: true,
      message: 'Describe progress this period',
    },
  ];
  if (behind) {
    checklist.push(
      {
        key: 'VARIANCE_EXPLANATION',
        ok: filled(commentary.varianceExplanation),
        blocking: true,
        message: `You are more than ${rules.rag.greenMaxPpBehind} pp behind plan: explain why`,
      },
      {
        key: 'RECOVERY_ACTION',
        ok: filled(commentary.recoveryAction),
        blocking: true,
        message: 'Describe the recovery action',
      },
    );
  }

  return {
    claimedCompletion,
    plannedCompletion,
    variancePp,
    needsEvidence,
    checklist,
    canSubmit: checklist.every((item) => item.ok || !item.blocking),
  };
}
