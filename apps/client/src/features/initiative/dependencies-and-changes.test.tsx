import type { ChangeRequestView, InitiativeDetail } from '@sims/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import { fakeApi, json } from '@/test/fake-api';
import { ITEMS, page } from '../initiatives/register.fixture';
import { CHANGE_REQUESTS, DIG_004, DIG_004_ID } from './initiative.fixture';

type Sent = { route: string; body: unknown };

function renderDetail(
  detail: InitiativeDetail = DIG_004,
  path = `/initiatives/${DIG_004_ID}`,
) {
  window.history.replaceState(null, '', path);
  const sent: Sent[] = [];
  const dependency = detail.dependencies.blockedBy[0]!;
  const api = fakeApi({
    signedIn: true,
    routes: {
      [`GET /api/v1/initiatives/${DIG_004_ID}`]: () => json(200, detail),
      'GET /api/v1/initiatives': () =>
        // Includes DIG-004 itself, which must not be offered.
        json(
          200,
          page([
            // The register fixture's own DIG-004 is left out: this one is "itself".
            ...ITEMS.filter((i) => i.code !== 'DIG-004'),
            {
              ...ITEMS[0]!,
              id: DIG_004_ID,
              code: 'DIG-004',
              title: DIG_004.title,
            },
          ]),
        ),
      [`POST /api/v1/initiatives/${DIG_004_ID}/dependencies`]: (init) => {
        sent.push({
          route: 'add-dependency',
          body: JSON.parse(String(init.body)),
        });
        return json(201, detail);
      },
      [`PATCH /api/v1/dependencies/${dependency.id}`]: (init) => {
        sent.push({
          route: 'edit-dependency',
          body: JSON.parse(String(init.body)),
        });
        return json(200, detail);
      },
      [`DELETE /api/v1/dependencies/${dependency.id}`]: () => {
        sent.push({ route: 'remove-dependency', body: null });
        return json(200, detail);
      },
      [`POST /api/v1/initiatives/${DIG_004_ID}/change-requests`]: (init) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        sent.push({ route: 'change-request', body });
        return json(201, {
          ...CHANGE_REQUESTS[0]!,
          reference: 'CR-0150',
        } satisfies ChangeRequestView);
      },
      'GET /api/v1/change-requests': () => json(200, CHANGE_REQUESTS),
      [`POST /api/v1/change-requests/${CHANGE_REQUESTS[0]!.id}/withdraw`]:
        () => {
          sent.push({ route: 'withdraw', body: null });
          return json(200, { ...CHANGE_REQUESTS[0], status: 'WITHDRAWN' });
        },
    },
  });
  return { ...api, sent, ...render(<App />), user: userEvent.setup() };
}

beforeEach(() => setSession(null));

describe('Dependencies', () => {
  it('records what the initiative waits on, chosen with the initiative picker', async () => {
    const { user, sent, container } = renderDetail();
    const card = await screen.findByRole('region', { name: 'Dependencies' });
    expect(within(card).getByText(/Needed by 20 Oct 2026/)).toBeVisible();
    await user.click(
      within(card).getByRole('button', { name: 'Add dependency' }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'What DIG-004 waits on',
    });
    const picker = within(dialog).getByRole('combobox', { name: /Waits on/ });
    await user.click(picker);
    // The initiative itself and ones already linked are not offered.
    expect(
      await within(dialog).findByRole('option', { name: /REV-002/ }),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole('option', { name: /DIG-004/ }),
    ).not.toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);

    await user.click(within(dialog).getByRole('option', { name: /REV-002/ }));
    await user.type(
      within(dialog).getByLabelText('What is needed'),
      'Partner API keys',
    );
    await user.click(within(dialog).getByLabelText(/On the critical path/));
    await user.click(
      within(dialog).getByRole('button', { name: 'Add dependency' }),
    );

    await waitFor(() =>
      expect(sent).toEqual([
        {
          route: 'add-dependency',
          body: {
            toInitiativeId: ITEMS[2]!.id,
            description: 'Partner API keys',
            isCriticalPath: true,
            status: 'ON_TRACK',
            neededBy: null,
          },
        },
      ]),
    );
  });

  it('updates the status of a dependency and removes it', async () => {
    const { user, sent } = renderDetail();
    const card = await screen.findByRole('region', { name: 'Dependencies' });
    await user.selectOptions(
      within(card).getByRole('combobox', {
        name: 'Status of dependency on DIG-011',
      }),
      'RESOLVED',
    );
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        route: 'edit-dependency',
        body: { status: 'RESOLVED' },
      }),
    );
    await user.click(
      within(card).getByRole('button', {
        name: 'Remove dependency on DIG-011',
      }),
    );
    await waitFor(() => expect(sent.at(-1)?.route).toBe('remove-dependency'));
  });
});

describe('Change requests', () => {
  it('asks for a budget change, sending only the new value, and shows it was sent', async () => {
    const { user, sent } = renderDetail();
    await user.click(
      await screen.findByRole('button', { name: 'Request change' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Request a change to DIG-004',
    });

    await user.click(within(dialog).getByLabelText('Budget'));
    expect(
      within(dialog).getByText(/goes to the executive sponsor/),
    ).toBeVisible();

    // Nothing changed yet: say so instead of sending an empty request.
    await user.click(
      within(dialog).getByRole('button', { name: 'Send for approval' }),
    );
    expect(
      await within(dialog).findByText('Change at least one value.'),
    ).toBeVisible();

    const budget = within(dialog).getByLabelText('New budget (NGN)');
    await user.clear(budget);
    await user.type(budget, '550000000');
    await user.type(
      within(dialog).getByLabelText(/Why is the change needed/),
      'Too short',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Send for approval' }),
    );
    expect(await within(dialog).findByText(/20\+ characters/)).toBeVisible();
    expect(sent).toEqual([]);

    await user.type(
      within(dialog).getByLabelText(/Why is the change needed/),
      ' — vendor contingency is required for the new scope',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Send for approval' }),
    );

    expect(
      await screen.findByText(/CR-0150 was sent for approval/),
    ).toBeVisible();
    expect(window.location.search).toBe('?tab=changes');
    expect(sent).toEqual([
      {
        route: 'change-request',
        body: {
          type: 'BUDGET_CHANGE',
          changes: { baselineBudget: 550_000_000 },
          justification:
            'Too short — vendor contingency is required for the new scope',
        },
      },
    ]);
  });

  it('sends only the milestones whose dates changed', async () => {
    const { user, sent } = renderDetail();
    await user.click(
      await screen.findByRole('button', { name: 'Request change' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/goes to the MD\/CEO/)).toBeVisible();
    const due = within(dialog).getByLabelText('Due date for Commercial launch');
    await user.clear(due);
    await user.type(due, '2027-01-31');
    await user.type(
      within(dialog).getByLabelText(/Why is the change needed/),
      'Launch moves after the core banking API delay',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Send for approval' }),
    );
    await waitFor(() =>
      expect(sent[0]?.body).toEqual({
        type: 'BASELINE_CHANGE',
        changes: {
          milestones: [
            {
              milestoneId: DIG_004.milestones[4]!.id,
              baselineDate: '2027-01-31',
            },
          ],
        },
        justification: 'Launch moves after the core banking API delay',
      }),
    );
  });

  it('shows what a request changes, and lets it be withdrawn', async () => {
    const { user, sent } = renderDetail(
      DIG_004,
      `/initiatives/${DIG_004_ID}?tab=changes`,
    );
    expect(await screen.findByText('Budget: ₦500m → ₦550m')).toBeVisible();
    expect(screen.getByText('Awaiting decision')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Withdraw CR-0139' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Withdraw CR-0139?',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Withdraw request' }),
    );
    await waitFor(() =>
      expect(sent).toEqual([{ route: 'withdraw', body: null }]),
    );
  });

  it('does not offer a change request before the baseline is locked', async () => {
    renderDetail({
      ...DIG_004,
      status: 'APPROVED',
      can: { ...DIG_004.can, requestChange: false },
    });
    await screen.findByRole('heading', { level: 1 });
    expect(
      screen.queryByRole('button', { name: 'Request change' }),
    ).not.toBeInTheDocument();
  });
});
