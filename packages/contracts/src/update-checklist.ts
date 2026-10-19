/**
 * The "Before you submit" rules for a monthly update. Shared on purpose: the
 * web app runs them live as the owner types, and the server runs the very
 * same code on save and submit, so the two can never disagree.
 */

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

export interface UpdateChecklistItem {
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
  checklist: UpdateChecklistItem[];
  canSubmit: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Commentary counts as written from 10 characters. */
const filled = (text: string | null) => !!text && text.trim().length >= 10;

/**
 * Evidence is blocking: a milestone that needs evidence and claims more
 * than last month's verified figure needs a file uploaded this period.
 *
 * @param varianceThresholdPp how far behind plan (pp) an update may be before
 *   a variance explanation and recovery action are required (the
 *   organisation's Green threshold).
 */
export function evaluateUpdate(
  lines: readonly UpdateLineFacts[],
  plannedCompletion: number,
  commentary: UpdateCommentary,
  varianceThresholdPp: number,
): UpdateEvaluation {
  const totalWeight = lines.reduce((sum, l) => sum + l.weight, 0);
  const claimedCompletion =
    totalWeight === 0
      ? 0
      : round2(
          lines.reduce((sum, l) => sum + l.weight * (l.claimed ?? l.lastVerified), 0) /
            totalWeight,
        );
  const variancePp = Math.round((claimedCompletion - plannedCompletion) * 10) / 10;
  const behind = -variancePp > varianceThresholdPp;

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

  const checklist: UpdateChecklistItem[] = [
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
      blocking: true,
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
        message: `You are more than ${varianceThresholdPp} pp behind plan: explain why`,
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
