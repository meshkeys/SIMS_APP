import { REPORT_READER_ROLES, type Role } from '@sims/contracts';

/** The sidebar, grouped as in the wireframes. */
export interface NavItem {
  to: string;
  label: string;
  /** Shown only to people holding one of these roles. */
  roles?: readonly Role[];
}

export const NAV: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Command',
    items: [
      { to: '/', label: 'Dashboard' },
      { to: '/strategy', label: 'Strategy map' },
      { to: '/initiatives', label: 'Initiatives' },
      { to: '/performance', label: 'Performance & benefits' },
      { to: '/risks', label: 'Risks & escalations' },
      { to: '/reports', label: 'Reports', roles: REPORT_READER_ROLES },
    ],
  },
  {
    heading: 'My work',
    items: [
      { to: '/my-updates', label: 'My updates' },
      {
        to: '/reviews',
        label: 'Reviews',
        roles: ['STRATEGY_OFFICE', 'SYSTEM_ADMIN', 'EXECUTIVE_SPONSOR', 'CEO'],
      },
    ],
  },
  { heading: 'Settings', items: [{ to: '/admin', label: 'Administration' }] },
];
