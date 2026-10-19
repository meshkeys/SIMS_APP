import type { InitiativeStatus } from '@sims/contracts';

export const STATUS_LABELS: Record<InitiativeStatus, string> = {
  DRAFT: 'Draft',
  PROPOSED: 'Awaiting approval',
  APPROVED: 'Approved',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

/** How each lifecycle move reads as an action, from the current status. */
export function moveLabel(
  from: InitiativeStatus,
  to: InitiativeStatus,
): string {
  switch (to) {
    case 'PROPOSED':
      return 'Submit for approval';
    case 'DRAFT':
      return 'Return for rework';
    case 'APPROVED':
      return 'Approve';
    case 'ACTIVE':
      return from === 'ON_HOLD' ? 'Resume' : 'Activate';
    case 'ON_HOLD':
      return 'Put on hold';
    case 'CLOSED':
      return 'Close';
    case 'CANCELLED':
      return 'Cancel initiative';
  }
}

export const INITIATIVE_TABS = {
  overview: 'Overview',
  milestones: 'Milestones & tasks',
  risks: 'Risks & issues',
  dependencies: 'Dependencies',
  changes: 'Change requests',
} as const;
export type InitiativeTab = keyof typeof INITIATIVE_TABS;
