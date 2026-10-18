import type { InitiativeStatus, Role } from '../../generated/prisma/enums.js';
import { isBaselineLocked } from './lifecycle.js';

/** How the caller relates to one initiative, most powerful first. */
export type InitiativeRelation = 'OFFICE' | 'SPONSOR' | 'OWNER' | 'NONE';

const OFFICE_ROLES: readonly Role[] = ['STRATEGY_OFFICE', 'SYSTEM_ADMIN'];

/** Roles that may propose new initiatives (part of the API contract). */
export { PROPOSER_ROLES } from '@sims/contracts';

export function relationTo(
  caller: { membershipId: string; roles: readonly Role[] },
  initiative: { ownerId: string | null; sponsorId: string | null },
): InitiativeRelation {
  if (caller.roles.some((role) => OFFICE_ROLES.includes(role))) return 'OFFICE';
  if (initiative.sponsorId === caller.membershipId) return 'SPONSOR';
  if (initiative.ownerId === caller.membershipId) return 'OWNER';
  return 'NONE';
}

/**
 * Initiative fields grouped by who may change them.
 * - Accountability (owner, sponsor, sensitivity, plan links): Strategy Office.
 * - Shape (title, priority, department, benefits owner): Office and sponsor.
 * - Narrative and running figures: Office, sponsor and owner.
 * - Baseline (dates, budget): anyone above may set it while the initiative
 *   is in the pipeline; once active it is locked for everyone — changes go
 *   through an approved change request (maker-checker).
 */
export const FIELD_GROUPS = {
  accountability: ['ownerId', 'sponsorId', 'isSensitive'],
  shape: ['title', 'priority', 'departmentId', 'benefitsOwnerId'],
  narrative: [
    'description',
    'businessCase',
    'scope',
    'forecastEnd',
    'spentToDate',
  ],
  baseline: ['baselineStart', 'baselineEnd', 'baselineBudget'],
} as const;

const GROUP_ACCESS: Record<
  keyof typeof FIELD_GROUPS,
  readonly InitiativeRelation[]
> = {
  accountability: ['OFFICE'],
  shape: ['OFFICE', 'SPONSOR'],
  narrative: ['OFFICE', 'SPONSOR', 'OWNER'],
  baseline: ['OFFICE', 'SPONSOR', 'OWNER'],
};

export type FieldDenial = {
  field: string;
  reason: 'NOT_PERMITTED' | 'BASELINE_LOCKED';
};

/** Fields in `changed` the caller may not change right now, and why. */
export function deniedFields(
  relation: InitiativeRelation,
  status: InitiativeStatus,
  changed: readonly string[],
): FieldDenial[] {
  const denials: FieldDenial[] = [];
  for (const field of changed) {
    const group = (
      Object.keys(FIELD_GROUPS) as (keyof typeof FIELD_GROUPS)[]
    ).find((key) => (FIELD_GROUPS[key] as readonly string[]).includes(field));
    if (!group || !GROUP_ACCESS[group].includes(relation)) {
      denials.push({ field, reason: 'NOT_PERMITTED' });
    } else if (group === 'baseline' && isBaselineLocked(status)) {
      denials.push({ field, reason: 'BASELINE_LOCKED' });
    }
  }
  return denials;
}

/**
 * Milestones: the Office, sponsor and owner manage them. On an initiative
 * whose baseline is locked, nobody changes the plan itself directly
 * (add, remove, weights, baseline dates); forecasts, titles and order stay open.
 */
export function canChangeMilestonePlan(
  relation: InitiativeRelation,
  status: InitiativeStatus,
): boolean {
  if (relation === 'NONE') return false;
  return !isBaselineLocked(status);
}

export function canWorkOnInitiative(relation: InitiativeRelation): boolean {
  return relation !== 'NONE';
}

/** Suggests the next code from the pillar's name: "Digital Transformation" → DIG-016. */
export function suggestInitiativeCode(
  pillarTitle: string | null,
  existingCodes: readonly string[],
): string {
  const letters = (pillarTitle ?? 'Initiative')
    .normalize('NFKD')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
  const prefix = (letters || 'INI').slice(0, 3).padEnd(3, 'X');
  const highest = existingCodes.reduce((max, code) => {
    const match = code.match(new RegExp(`^${prefix}-(\\d+)$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(3, '0')}`;
}
