/**
 * What a change request may alter on an active initiative, and checks that
 * the result is coherent before it goes to the approver — and again when it
 * is applied, because the initiative may have moved on in between.
 */

export interface MilestonePlan {
  id: string;
  title: string;
  weight: number;
  isCritical: boolean;
  baselineStartDate: string | null;
  baselineDate: string;
  hasProgress: boolean;
}

export interface BaselineState {
  baselineStart: string | null;
  baselineEnd: string | null;
  baselineBudget: number | null;
  scope: string | null;
  milestones: MilestonePlan[];
}

export interface RequestedChanges {
  baselineStart?: string | null;
  baselineEnd?: string | null;
  baselineBudget?: number | null;
  scope?: string | null;
  milestones?: {
    milestoneId: string;
    weight?: number;
    isCritical?: boolean;
    baselineStartDate?: string | null;
    baselineDate?: string;
  }[];
  addMilestones?: {
    title: string;
    weight: number;
    isCritical?: boolean;
    baselineStartDate?: string | null;
    baselineDate: string;
  }[];
  removeMilestoneIds?: string[];
}

export interface ChangeProblem {
  path: string;
  message: string;
}

/** The baseline as it would be after the change, or the problems that prevent it. */
export function applyChanges(
  current: BaselineState,
  changes: RequestedChanges,
): { result: BaselineState; problems: ChangeProblem[] } {
  const problems: ChangeProblem[] = [];
  const byId = new Map(current.milestones.map((m) => [m.id, m]));

  let milestones = current.milestones.map((m) => ({ ...m }));
  (changes.milestones ?? []).forEach((change, index) => {
    const target = milestones.find((m) => m.id === change.milestoneId);
    if (!target) {
      problems.push({
        path: `milestones.${index}.milestoneId`,
        message: 'Not a milestone of this initiative',
      });
      return;
    }
    if (change.weight !== undefined) target.weight = change.weight;
    if (change.isCritical !== undefined) target.isCritical = change.isCritical;
    if (change.baselineStartDate !== undefined)
      target.baselineStartDate = change.baselineStartDate;
    if (change.baselineDate !== undefined)
      target.baselineDate = change.baselineDate;
  });

  (changes.removeMilestoneIds ?? []).forEach((id, index) => {
    const milestone = byId.get(id);
    if (!milestone)
      problems.push({
        path: `removeMilestoneIds.${index}`,
        message: 'Not a milestone of this initiative',
      });
    else if (milestone.hasProgress) {
      problems.push({
        path: `removeMilestoneIds.${index}`,
        message: `"${milestone.title}" has progress and is kept for the record`,
      });
    }
  });
  const removable = new Set(
    (changes.removeMilestoneIds ?? []).filter(
      (id) => byId.has(id) && !byId.get(id)!.hasProgress,
    ),
  );
  milestones = milestones.filter((m) => !removable.has(m.id));

  (changes.addMilestones ?? []).forEach((added, index) => {
    milestones.push({
      id: `new:${index}`,
      title: added.title,
      weight: added.weight,
      isCritical: added.isCritical ?? false,
      baselineStartDate: added.baselineStartDate ?? null,
      baselineDate: added.baselineDate,
      hasProgress: false,
    });
  });

  const result: BaselineState = {
    baselineStart:
      changes.baselineStart !== undefined
        ? changes.baselineStart
        : current.baselineStart,
    baselineEnd:
      changes.baselineEnd !== undefined
        ? changes.baselineEnd
        : current.baselineEnd,
    baselineBudget:
      changes.baselineBudget !== undefined
        ? changes.baselineBudget
        : current.baselineBudget,
    scope: changes.scope !== undefined ? changes.scope : current.scope,
    milestones,
  };

  if (
    result.baselineStart &&
    result.baselineEnd &&
    result.baselineEnd < result.baselineStart
  ) {
    problems.push({
      path: 'baselineEnd',
      message: 'The end date must be on or after the start date',
    });
  }
  milestones.forEach((m) => {
    if (m.baselineStartDate && m.baselineDate < m.baselineStartDate) {
      problems.push({
        path: `milestones.${m.id}`,
        message: `"${m.title}": the due date must be on or after its start`,
      });
    }
  });
  if (milestones.length > 0 && milestones.every((m) => m.weight === 0)) {
    problems.push({
      path: 'milestones',
      message: 'At least one milestone must keep a weight',
    });
  }
  return { result, problems };
}

/** A request must change something. */
export function isEmptyChange(changes: RequestedChanges): boolean {
  return (
    changes.baselineStart === undefined &&
    changes.baselineEnd === undefined &&
    changes.baselineBudget === undefined &&
    changes.scope === undefined &&
    !changes.milestones?.length &&
    !changes.addMilestones?.length &&
    !changes.removeMilestoneIds?.length
  );
}
