import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import {
  type FakeRoute,
  fakeApi,
  json,
  problem,
  SESSION,
} from '@/test/fake-api';
import {
  ADMIN,
  AUDIT,
  DEPARTMENTS,
  FORMER,
  INVITATION,
  membersPage,
  ORGANISATION,
  TUNDE,
} from './admin-sections.fixture';

type Role = (typeof SESSION.session.membership.roles)[number];

function renderSection(
  path: string,
  options: { roles?: Role[]; routes?: Record<string, FakeRoute> } = {},
) {
  window.history.replaceState(null, '', path);
  const sent: { route: string; body: unknown; search?: string }[] = [];
  const record =
    (route: string, response: () => Response): FakeRoute =>
    (init, url) => {
      sent.push({
        route,
        body: init.body ? JSON.parse(String(init.body)) : null,
        search: url.search,
      });
      return response();
    };
  const api = fakeApi({
    signedIn: true,
    session: options.roles
      ? {
          ...SESSION,
          session: {
            ...SESSION.session,
            membership: { ...SESSION.session.membership, roles: options.roles },
          },
        }
      : undefined,
    routes: {
      'GET /api/v1/admin/members': (_init, url) =>
        json(
          200,
          membersPage(
            url.searchParams.get('status') === 'DEACTIVATED'
              ? [FORMER]
              : [ADMIN, TUNDE],
          ),
        ),
      'GET /api/v1/members': () =>
        json(200, { items: [], page: 1, pageSize: 8, total: 0 }),
      'GET /api/v1/invitations': () => json(200, [INVITATION]),
      'GET /api/v1/departments': () => json(200, DEPARTMENTS),
      'GET /api/v1/organisation': () => json(200, ORGANISATION),
      'GET /api/v1/audit': record('audit', () => json(200, AUDIT)),
      [`PATCH /api/v1/admin/members/${TUNDE.membershipId}`]: record(
        'updateMember',
        () => json(200, { ...TUNDE, roles: ['INITIATIVE_OWNER'] }),
      ),
      [`POST /api/v1/admin/members/${TUNDE.membershipId}/deactivate`]: record(
        'deactivate',
        () => json(200, { ...TUNDE, status: 'DEACTIVATED' }),
      ),
      [`POST /api/v1/admin/members/${FORMER.membershipId}/reactivate`]: record(
        'reactivate',
        () => json(200, { ...FORMER, status: 'ACTIVE' }),
      ),
      'POST /api/v1/invitations': record('invite', () =>
        json(201, {
          ...INVITATION,
          email: 'kemi@meridian.example',
          emailDelivered: false,
        }),
      ),
      [`POST /api/v1/invitations/${INVITATION.id}/resend`]: record(
        'resend',
        () => json(200, { ...INVITATION, emailDelivered: true }),
      ),
      'PATCH /api/v1/organisation': record('updateOrganisation', () =>
        json(200, { ...ORGANISATION, currency: 'USD' }),
      ),
      ...options.routes,
    },
  });
  return { ...api, sent, ...render(<App />), user: userEvent.setup() };
}

const menu = () =>
  within(screen.getByRole('navigation', { name: 'Administration sections' }));

beforeEach(() => setSession(null));

describe('Administration: who sees which section', () => {
  it('shows internal audit the audit log only, and the menu entry', async () => {
    renderSection('/admin', { roles: ['INTERNAL_AUDIT'] });

    expect(
      await screen.findByRole('heading', { name: 'Audit log' }),
    ).toBeVisible();
    expect(menu().getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Administration' })).toBeVisible();
  });

  it('shows the MD/CEO the rules and organisation, not people or the audit log', async () => {
    renderSection('/admin?section=people', { roles: ['CEO'] });

    // A section they cannot open falls back to the rules.
    await screen.findByRole('link', { name: /RAG & health rules/ });
    expect(
      menu().getByRole('link', { name: /RAG & health rules/ }),
    ).toHaveAttribute('aria-current', 'page');
    expect(menu().queryByRole('link', { name: /Users & roles/ })).toBeNull();
    expect(menu().queryByRole('link', { name: /Audit log/ })).toBeNull();
    expect(menu().getByRole('link', { name: /Organisation/ })).toBeVisible();
  });
});

describe('Administration: users and roles', () => {
  it('lists members with their roles and what they are accountable for', async () => {
    const { container } = renderSection('/admin?section=people');

    const row = (
      await screen.findByRole('rowheader', { name: /Tunde Adeyemi/ })
    ).closest('tr')!;
    expect(within(row).getByText('Initiative owner')).toBeVisible();
    expect(
      within(row).getByText(
        'owns 3 live initiatives; sponsors 1 live initiative; has 2 decisions waiting',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Active (2)', pressed: true }),
    ).toBeVisible();
    // An administrator can only be changed by an administrator.
    expect(screen.queryByRole('button', { name: 'Edit Ngozi Eze' })).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('changes roles, sending only what changed', async () => {
    const { user, sent } = renderSection('/admin?section=people', {
      roles: ['STRATEGY_OFFICE'],
    });

    await user.click(
      await screen.findByRole('button', { name: 'Edit Tunde Adeyemi' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Edit Tunde Adeyemi',
    });
    // Not an administrator: the administrator role is locked.
    expect(
      within(dialog).getByRole('checkbox', { name: 'System administrator' }),
    ).toBeDisabled();
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Executive sponsor' }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );

    expect(
      await screen.findByText(/Tunde Adeyemi was updated\. New roles apply/),
    ).toBeVisible();
    expect(sent).toContainEqual(
      expect.objectContaining({
        route: 'updateMember',
        body: { roles: ['INITIATIVE_OWNER'] },
      }),
    );
  });

  it('warns about responsibilities before deactivating, and shows refusals', async () => {
    const { user } = renderSection('/admin?section=people', {
      routes: {
        [`POST /api/v1/admin/members/${TUNDE.membershipId}/deactivate`]: () =>
          problem(
            409,
            'LAST_ADMIN',
            'The organisation must keep at least one active administrator.',
          ),
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Deactivate Tunde Adeyemi' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Deactivate Tunde Adeyemi?',
    });
    expect(
      within(dialog).getByText('Hand over their responsibilities first'),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole('button', { name: 'Deactivate' }),
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The organisation must keep at least one active administrator.',
    );
  });

  it('reactivates a deactivated member', async () => {
    const { user, sent } = renderSection('/admin?section=people');

    await user.click(
      await screen.findByRole('button', { name: 'Deactivated (1)' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Reactivate Chidi Obi' }),
    );

    expect(
      await screen.findByText(
        'Chidi Obi can sign in again, with the same roles.',
      ),
    ).toBeVisible();
    expect(sent.map((s) => s.route)).toContain('reactivate');
  });

  it('invites someone and says when the email could not be sent', async () => {
    const { user, sent } = renderSection('/admin?section=people');

    await user.click(
      await screen.findByRole('button', { name: 'Invite someone' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Invite someone',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Send invitation' }),
    );
    expect(within(dialog).getByText('Enter their work email')).toBeVisible();
    expect(within(dialog).getByText('Choose at least one role')).toBeVisible();

    await user.type(
      within(dialog).getByRole('textbox', { name: /Work email/ }),
      'kemi@meridian.example',
    );
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Task owner' }),
    );
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Department' }),
      'Finance',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Send invitation' }),
    );

    expect(
      await screen.findByText(/the email could not be sent/),
    ).toBeVisible();
    expect(sent).toContainEqual(
      expect.objectContaining({
        route: 'invite',
        body: {
          email: 'kemi@meridian.example',
          roles: ['TASK_OWNER'],
          departmentId: DEPARTMENTS[2]!.id,
        },
      }),
    );
  });

  it('resends a waiting invitation', async () => {
    const { user } = renderSection('/admin?section=people');

    await user.click(
      await screen.findByRole('button', {
        name: 'Resend the invitation to new.hire@meridian.example',
      }),
    );

    expect(
      await screen.findByText(
        'A new link was sent to new.hire@meridian.example.',
      ),
    ).toBeVisible();
  });
});

describe('Administration: departments', () => {
  it('shows departments as a tree and explains why one cannot be deleted', async () => {
    const { user, container } = renderSection('/admin?section=departments', {
      routes: {
        [`DELETE /api/v1/departments/${DEPARTMENTS[0]!.id}`]: () =>
          problem(
            409,
            'DEPARTMENT_IN_USE',
            'Retail Banking still has 4 members, 1 sub-department. Move them first.',
          ),
      },
    });

    const rows = await screen.findAllByRole('rowheader');
    expect(rows.map((r) => r.textContent)).toEqual([
      'Finance',
      'Retail Banking',
      '↳Branches',
    ]);
    expect(await axeViolations(container)).toEqual([]);

    await user.click(
      screen.getByRole('button', { name: 'Delete Retail Banking' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete department' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'still has 4 members, 1 sub-department',
    );
  });

  it('adds a department and shows a taken name on the field', async () => {
    const { user } = renderSection('/admin?section=departments', {
      routes: {
        'POST /api/v1/departments': () =>
          problem(
            409,
            'NAME_TAKEN',
            'There is already a department called Finance.',
          ),
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Add department' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Add a department',
    });
    await user.type(
      within(dialog).getByRole('textbox', { name: /Name/ }),
      'Finance',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Add department' }),
    );

    const name = within(dialog).getByRole('textbox', { name: /Name/ });
    await waitFor(() =>
      expect(name).toHaveAccessibleDescription(
        'There is already a department called Finance.',
      ),
    );
    expect(name).toHaveAttribute('aria-invalid', 'true');
  });

  it('never offers a department, or one beneath it, as its own parent', async () => {
    const { user } = renderSection('/admin?section=departments');

    await user.click(
      await screen.findByRole('button', { name: 'Edit Retail Banking' }),
    );
    const parent = within(await screen.findByRole('dialog')).getByRole(
      'combobox',
      { name: 'Sits inside' },
    );
    expect(
      within(parent)
        .getAllByRole('option')
        .map((o) => o.textContent?.trim()),
    ).toEqual(['Nothing (top level)', 'Finance']);
  });
});

describe('Administration: organisation', () => {
  it('lets a system administrator change settings, sending only changes', async () => {
    const { user, sent } = renderSection('/admin?section=organisation');

    const currency = await screen.findByRole('combobox', { name: /Currency/ });
    await user.selectOptions(currency, 'USD');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText(/Settings saved/)).toBeVisible();
    expect(sent).toContainEqual(
      expect.objectContaining({
        route: 'updateOrganisation',
        body: { currency: 'USD' },
      }),
    );
  });

  it('shows the settings read-only to everyone else', async () => {
    renderSection('/admin?section=organisation', {
      roles: ['STRATEGY_OFFICE'],
    });

    expect(
      await screen.findByText(
        'Only a system administrator can change these settings.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: /^Name/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull();
  });
});

describe('Administration: audit log', () => {
  it('lists changes with who made them, and filters by action', async () => {
    const { user, sent, container } = renderSection('/admin?section=audit');

    const row = (
      await screen.findByRole('rowheader', { name: /Organisation updated/ })
    ).closest('tr')!;
    expect(within(row).getByText('Amara Bello')).toBeVisible();
    expect(screen.getByText('System')).toBeVisible();
    await user.click(within(row).getByText('Show values'));
    expect(within(row).getByText(/"currency": "USD"/)).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Action' }),
      'Escalated',
    );
    await waitFor(() =>
      expect(sent.at(-1)?.search).toContain('action=ESCALATED'),
    );
  });
});
