/** The sidebar, grouped as in the wireframes. */
export interface NavItem {
  to: string;
  label: string;
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
      { to: '/reports', label: 'Reports' },
    ],
  },
  { heading: 'My work', items: [{ to: '/my-updates', label: 'My updates' }] },
  { heading: 'Settings', items: [{ to: '/admin', label: 'Administration' }] },
];
