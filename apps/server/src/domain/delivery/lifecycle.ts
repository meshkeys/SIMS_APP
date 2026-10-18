import type { InitiativeStatus } from '../../generated/prisma/enums.js';

/**
 * Initiative lifecycle:
 *
 *   DRAFT ──▶ PROPOSED ──▶ APPROVED ──▶ ACTIVE ⇄ ON_HOLD
 *     ▲          │                        │
 *     └──────────┘ (returned for rework)  └──▶ CLOSED
 *   any open status ──▶ CANCELLED
 *
 * Closed and cancelled are final: history stays for benefits tracking and audit.
 */
const TRANSITIONS: Record<InitiativeStatus, readonly InitiativeStatus[]> = {
  DRAFT: ['PROPOSED', 'CANCELLED'],
  PROPOSED: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['ON_HOLD', 'CLOSED', 'CANCELLED'],
  ON_HOLD: ['ACTIVE', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
};

/** Moves that must say why (they stop or pause delivery). */
const NEEDS_REASON: readonly InitiativeStatus[] = ['ON_HOLD', 'CANCELLED', 'CLOSED'];

export function allowedTransitions(from: InitiativeStatus): readonly InitiativeStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: InitiativeStatus, to: InitiativeStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transitionNeedsReason(to: InitiativeStatus): boolean {
  return NEEDS_REASON.includes(to);
}

/** Statuses whose baseline (dates, budget, milestone plan) is locked. */
export function isBaselineLocked(status: InitiativeStatus): boolean {
  return status === 'ACTIVE' || status === 'ON_HOLD' || status === 'CLOSED' || status === 'CANCELLED';
}

export interface ReadinessFacts {
  ownerId: string | null;
  sponsorId: string | null;
  baselineStart: Date | null;
  baselineEnd: Date | null;
  hasPrimaryObjective: boolean;
  /** Milestones with weight above zero. */
  weightedMilestones: number;
}

/**
 * What is missing before an initiative can start delivering — health cannot be
 * calculated, or accountability assigned, without these.
 */
export function activationGaps(facts: ReadinessFacts): string[] {
  const gaps: string[] = [];
  if (!facts.ownerId) gaps.push('Assign an initiative owner');
  if (!facts.sponsorId) gaps.push('Assign an executive sponsor');
  if (!facts.baselineStart || !facts.baselineEnd) gaps.push('Set baseline start and end dates');
  if (!facts.hasPrimaryObjective) gaps.push('Link it to the objective it primarily delivers');
  if (facts.weightedMilestones === 0) gaps.push('Add at least one milestone with a weight');
  return gaps;
}
