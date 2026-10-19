import {
  changeRequestViewSchema,
  type InitiativeDetail,
  initiativeDetailSchema,
} from '@sims/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import { fakeApi, json, problem } from '@/test/fake-api';
import { CHANGE_REQUESTS, DIG_004, DIG_004_ID } from './initiative.fixture';

function renderInitiative(
  options: {
    path?: string;
    detail?: InitiativeDetail | Response;
    onStatus?: (body: Record<string, unknown>) => Response;
    onOverride?: (body: Record<string, unknown>) => Response;
  } = {},
) {
  window.history.replaceState(
    null,
    '',
    options.path ?? `/initiatives/${DIG_004_ID}`,
  );
  const sent: { route: string; body: unknown }[] = [];
  const api = fakeApi({
    signedIn: true,
    routes: {
      [`GET /api/v1/initiatives/${DIG_004_ID}`]: () =>
        options.detail instanceof Response
          ? options.detail
          : json(200, options.detail ?? DIG_004),
      [`POST /api/v1/initiatives/${DIG_004_ID}/status`]: (init) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        sent.push({ route: 'status', body });
        return (
          options.onStatus?.(body) ??
          json(200, {
            ...DIG_004,
            status: body.status,
            can: { ...DIG_004.can, changeStatus: ['ACTIVE', 'CANCELLED'] },
          })
        );
      },
      [`PUT /api/v1/initiatives/${DIG_004_ID}/override`]: (init) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        sent.push({ route: 'override', body });
        return options.onOverride?.(body) ?? json(200, DIG_004);
      },
      [`DELETE /api/v1/initiatives/${DIG_004_ID}/override`]: () => {
        sent.push({ route: 'clear', body: null });
        return json(200, {
          ...DIG_004,
          health: { ...DIG_004.health, effective: 'RED', override: null },
        });
      },
      'GET /api/v1/change-requests': () => json(200, CHANGE_REQUESTS),
    },
  });
  return { ...api, sent, ...render(<App />), user: userEvent.setup() };
}

/** What someone unrelated to the initiative may do: nothing. */
const READ_ONLY: InitiativeDetail['can'] = {
  changeStatus: [],
  override: false,
  edit: false,
  requestChange: false,
  editFields: [],
  changeObjectives: false,
  planMilestones: false,
  manageWork: false,
};

beforeEach(() => setSession(null));

describe('Initiative detail', () => {
  it('uses fixtures that satisfy the contract', () => {
    expect(initiativeDetailSchema.safeParse(DIG_004).success).toBe(true);
    for (const cr of CHANGE_REQUESTS) {
      expect(changeRequestViewSchema.safeParse(cr).success).toBe(true);
    }
  });

  it('shows status, delivery, risks, dependencies and history', async () => {
    const { container } = renderInitiative();
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Launch Digital Investment Platform',
      }),
    ).toBeVisible();
    expect(document.title).toBe(
      'DIG-004 · Launch Digital Investment Platform · SIMS',
    );

    // Header chips and facts.
    expect(screen.getByText('At risk · overridden')).toBeVisible();
    expect(screen.getByText('Contributes to O2.1 · O1.1')).toBeVisible();
    expect(screen.getByText('₦500m · 58% spent')).toBeVisible();
    expect(screen.getByText('1 Mar 2026 – 31 Dec 2026')).toBeVisible();
    expect(screen.getByText('11 Oct 2026')).toBeVisible();

    // Execution and impact.
    expect(screen.getByText('9 pp behind plan')).toBeVisible();
    expect(
      screen.getByText('Pilot only. Benefits expected from Q1 2027'),
    ).toBeVisible();

    // Why this status: the rules, the result and the override.
    const why = screen.getByRole('region', { name: 'Why this status?' });
    expect(within(why).getByText('Result: Delayed')).toBeVisible();
    expect(within(why).getByText('Shown as At risk')).toBeVisible();
    expect(within(why).getByText(/Contract terms agreed/)).toBeVisible();

    // Milestones add up; the overdue critical one is flagged.
    const milestones = screen.getByRole('region', { name: 'Milestones' });
    expect(
      within(milestones).getByText('Critical · 9 days overdue'),
    ).toBeVisible();
    expect(
      within(milestones).getByText('22 Oct 2026 (forecast)'),
    ).toBeVisible();
    const total = within(milestones).getByRole('row', { name: /Total/ });
    expect(within(total).getByText('100%')).toBeVisible();
    expect(within(total).getByText('65%')).toBeVisible();

    // Chart summary for everyone, including screen readers.
    expect(
      screen.getByRole('img', {
        name: /verified progress was 60% against 66% planned/,
      }),
    ).toBeVisible();

    expect(screen.getByText(/escalated L3/)).toBeVisible();
    expect(screen.getByText('Blocked by')).toBeVisible();
    expect(
      screen.getByText('Status overridden Red → Amber with reason'),
    ).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('puts an initiative on hold, asking why', async () => {
    const { user, sent } = renderInitiative();
    await user.click(
      await screen.findByRole('button', { name: 'Change status' }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'Put on hold' }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Put on hold: DIG-004',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Put on hold' }),
    );
    expect(
      within(dialog).getByText('Explain the change in at least 10 characters'),
    ).toBeVisible();
    expect(sent).toEqual([]);

    await user.type(
      within(dialog).getByLabelText(/Reason/),
      'Vendor re-tender under way',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Put on hold' }),
    );

    expect(
      await screen.findByText('Delivery and reporting are paused.'),
    ).toBeVisible();
    expect(sent).toEqual([
      {
        route: 'status',
        body: { status: 'ON_HOLD', reason: 'Vendor re-tender under way' },
      },
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains why a move was refused, without closing', async () => {
    const { user } = renderInitiative({
      detail: {
        ...DIG_004,
        status: 'APPROVED',
        can: { ...DIG_004.can, changeStatus: ['ACTIVE', 'CANCELLED'] },
      },
      onStatus: () =>
        problem(
          409,
          'NOT_READY_TO_ACTIVATE',
          'Add at least one weighted milestone before activating.',
        ),
    });
    await user.click(
      await screen.findByRole('button', { name: 'Change status' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Activate' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Activate' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Add at least one weighted milestone before activating.',
    );
  });

  it('sets and removes a health override', async () => {
    const { user, sent } = renderInitiative({
      detail: {
        ...DIG_004,
        health: { ...DIG_004.health, effective: 'RED', override: null },
      },
    });
    const why = await screen.findByRole('region', { name: 'Why this status?' });
    await user.click(within(why).getByRole('button', { name: 'Override' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Override health: DIG-004',
    });
    await user.selectOptions(within(dialog).getByLabelText(/Show as/), 'AMBER');
    await user.type(
      within(dialog).getByLabelText(/Reason/),
      'Contract signed yesterday',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Override' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(sent).toEqual([
      {
        route: 'override',
        body: { health: 'AMBER', reason: 'Contract signed yesterday' },
      },
    ]);
    // The response shows the override; it can be removed again.
    await user.click(
      await screen.findByRole('button', { name: 'Remove override' }),
    );
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Remove override',
      }),
    );
    await waitFor(() => expect(sent.at(-1)?.route).toBe('clear'));
  });

  it('shows read-only views to people who may not act', async () => {
    renderInitiative({
      detail: {
        ...DIG_004,
        can: READ_ONLY,
      },
    });
    await screen.findByRole('heading', { level: 1 });
    expect(
      screen.queryByRole('button', { name: 'Change status' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Override' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove override' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the open tab in the URL', async () => {
    const { user } = renderInitiative();
    await user.click(
      await screen.findByRole('tab', { name: /Risks & issues/ }),
    );
    await waitFor(() => expect(window.location.search).toBe('?tab=risks'));
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      'SEC product approval may slip past launch date',
    );
  });

  it('opens straight on change requests from a link', async () => {
    renderInitiative({ path: `/initiatives/${DIG_004_ID}?tab=changes` });
    expect(await screen.findByText('CR-0139')).toBeVisible();
    expect(
      screen.getByRole('tab', { name: 'Change requests' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByText('Release contingency for the vendor.'),
    ).toBeVisible();
  });

  it('does not reveal whether a restricted initiative exists', async () => {
    renderInitiative({
      detail: problem(404, 'INITIATIVE_NOT_FOUND', 'Not found'),
    });
    expect(
      await screen.findByText('This initiative cannot be shown'),
    ).toBeVisible();
  });
});
