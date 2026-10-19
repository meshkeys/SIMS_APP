import type { InitiativeDetail } from '@sims/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import { fakeApi, json } from '@/test/fake-api';
import { IDS, MAP } from '../strategy/strategy.fixture';
import { DIG_004, DIG_004_ID } from './initiative.fixture';

const OWNER: InitiativeDetail['can'] = {
  changeStatus: [],
  override: false,
  edit: true,
  requestChange: true,
  editFields: [
    'description',
    'businessCase',
    'scope',
    'forecastEnd',
    'spentToDate',
  ],
  changeObjectives: false,
  planMilestones: false,
  manageWork: true,
};

/** The Strategy Office on an approved initiative: the plan is still open. */
const PLANNING: InitiativeDetail = {
  ...DIG_004,
  status: 'APPROVED',
  contributesTo: [
    {
      elementId: IDS.o11,
      code: 'O1.1',
      title: 'Grow non-interest income share',
      weight: 70,
      isPrimary: true,
    },
  ],
  can: {
    ...DIG_004.can,
    changeStatus: ['ACTIVE', 'CANCELLED'],
    override: false,
    requestChange: false,
    editFields: [
      ...DIG_004.can.editFields,
      'baselineStart',
      'baselineEnd',
      'baselineBudget',
    ],
    planMilestones: true,
  },
};

type Sent = { route: string; body: unknown };

function renderEditing(
  detail: InitiativeDetail,
  path = `/initiatives/${DIG_004_ID}`,
) {
  window.history.replaceState(null, '', path);
  const sent: Sent[] = [];
  const record = (route: string) => (init: RequestInit) => {
    sent.push({
      route,
      body: init.body ? JSON.parse(String(init.body)) : null,
    });
    return json(200, detail);
  };
  const milestone = detail.milestones[2]!; // "Technology development"
  const task = milestone.tasks[0]!;
  const api = fakeApi({
    signedIn: true,
    routes: {
      [`GET /api/v1/initiatives/${DIG_004_ID}`]: () => json(200, detail),
      [`PATCH /api/v1/initiatives/${DIG_004_ID}`]: record('details'),
      [`PUT /api/v1/initiatives/${DIG_004_ID}/objectives`]:
        record('objectives'),
      [`POST /api/v1/initiatives/${DIG_004_ID}/milestones`]:
        record('add-milestone'),
      [`PATCH /api/v1/milestones/${milestone.id}`]: record('edit-milestone'),
      [`DELETE /api/v1/milestones/${milestone.id}`]: record('remove-milestone'),
      [`POST /api/v1/milestones/${milestone.id}/tasks`]: record('add-task'),
      [`PATCH /api/v1/tasks/${task.id}`]: record('edit-task'),
      [`DELETE /api/v1/tasks/${task.id}`]: record('remove-task'),
      'GET /api/v1/plans/current/map': () => json(200, MAP),
      'GET /api/v1/departments': () => json(200, []),
      'GET /api/v1/members': () =>
        json(200, { items: [], page: 1, pageSize: 8, total: 0 }),
    },
  });
  return { ...api, sent, ...render(<App />), user: userEvent.setup() };
}

beforeEach(() => setSession(null));

describe('Editing an initiative', () => {
  it('shows the owner only the fields they may change, and sends only what changed', async () => {
    const { user, sent, container } = renderEditing({ ...DIG_004, can: OWNER });
    await user.click(
      await screen.findByRole('button', { name: 'Edit details' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Edit DIG-004' });

    expect(
      within(dialog).getByText(/baseline \(dates and budget\) is locked/),
    ).toBeVisible();
    expect(within(dialog).queryByLabelText(/^Title/)).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('combobox', { name: 'Owner' }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Business case/)).toHaveValue(
      'Fee income from digital wealth customers.',
    );
    expect(await axeViolations(container)).toEqual([]);

    await user.type(
      within(dialog).getByLabelText('Forecast end'),
      '2027-01-31',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );

    await waitFor(() =>
      expect(sent).toEqual([
        { route: 'details', body: { forecastEnd: '2027-01-31' } },
      ]),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lets the Strategy Office change people, and relink objectives', async () => {
    const { user, sent } = renderEditing(PLANNING);
    await user.click(
      await screen.findByRole('button', { name: 'Edit details' }),
    );
    const details = await screen.findByRole('dialog', { name: 'Edit DIG-004' });
    // The current sponsor is shown before any search.
    expect(
      within(details).getByRole('combobox', { name: 'Executive sponsor' }),
    ).toHaveValue('Tunde Bakare');
    expect(within(details).getByLabelText('Baseline start')).toHaveValue(
      '2026-03-01',
    );
    await user.click(within(details).getByRole('button', { name: 'Cancel' }));

    await user.click(
      screen.getByRole('button', { name: 'Change what it contributes to' }),
    );
    const objectives = await screen.findByRole('dialog', {
      name: 'What DIG-004 delivers',
    });
    const weight = within(objectives).getByLabelText(/Weight %/);
    await user.clear(weight);
    await user.type(weight, '90');
    await user.click(within(objectives).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(sent).toEqual([
        {
          route: 'objectives',
          body: {
            objectives: [{ elementId: IDS.o11, weight: 90, isPrimary: true }],
          },
        },
      ]),
    );
  });

  it('plans milestones before activation: add, edit the weight, remove', async () => {
    const { user, sent } = renderEditing(PLANNING);
    const card = await screen.findByRole('region', { name: 'Milestones' });

    await user.click(
      within(card).getByRole('button', { name: 'Add milestone' }),
    );
    let dialog = await screen.findByRole('dialog', {
      name: 'Add a milestone to DIG-004',
    });
    await user.type(
      within(dialog).getByLabelText(/^Title/),
      'Go-live readiness review',
    );
    await user.clear(within(dialog).getByLabelText(/Weight %/));
    await user.type(within(dialog).getByLabelText(/Weight %/), '5');
    await user.type(within(dialog).getByLabelText(/^Due/), '2026-12-15');
    await user.click(
      within(dialog).getByRole('button', { name: 'Add milestone' }),
    );
    await waitFor(() => expect(sent.at(-1)?.route).toBe('add-milestone'));
    expect(sent.at(-1)?.body).toMatchObject({
      title: 'Go-live readiness review',
      weight: 5,
      baselineDate: '2026-12-15',
      isCritical: false,
      evidenceRequired: true,
    });

    await user.click(
      within(card).getByRole('button', { name: 'Edit Technology development' }),
    );
    dialog = await screen.findByRole('dialog', { name: 'Edit milestone' });
    await user.clear(within(dialog).getByLabelText(/Weight %/));
    await user.type(within(dialog).getByLabelText(/Weight %/), '35');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        route: 'edit-milestone',
        body: { weight: 35 },
      }),
    );

    await user.click(
      within(card).getByRole('button', {
        name: 'Remove Technology development',
      }),
    );
    dialog = await screen.findByRole('dialog', {
      name: 'Remove this milestone?',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove milestone' }),
    );
    await waitFor(() => expect(sent.at(-1)?.route).toBe('remove-milestone'));
  });

  it('after activation, only the title and forecast of a milestone can change', async () => {
    const { user, sent } = renderEditing({ ...DIG_004, can: OWNER });
    const card = await screen.findByRole('region', { name: 'Milestones' });
    expect(
      within(card).queryByRole('button', { name: 'Add milestone' }),
    ).not.toBeInTheDocument();
    expect(
      within(card).queryByRole('button', { name: /^Remove/ }),
    ).not.toBeInTheDocument();

    await user.click(
      within(card).getByRole('button', { name: 'Edit Technology development' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Edit milestone',
    });
    expect(within(dialog).getByText(/plan is locked/)).toBeVisible();
    expect(within(dialog).queryByLabelText(/Weight %/)).not.toBeInTheDocument();
    const forecast = within(dialog).getByLabelText('Forecast date');
    expect(forecast).toHaveValue('2026-10-31');
    await user.clear(forecast);
    await user.type(forecast, '2026-11-07');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(sent).toEqual([
        { route: 'edit-milestone', body: { forecastDate: '2026-11-07' } },
      ]),
    );
  });

  it('manages tasks: add, move to done, remove', async () => {
    const { user, sent } = renderEditing(
      { ...DIG_004, can: OWNER },
      `/initiatives/${DIG_004_ID}?tab=milestones`,
    );
    const tasks = await screen.findByRole('region', { name: 'Tasks' });

    await user.click(
      within(tasks).getByRole('button', {
        name: 'Add task to Technology development',
      }),
    );
    const form = within(tasks).getByRole('form', {
      name: 'New task for Technology development',
    });
    await user.type(within(form).getByLabelText(/^Task/), 'Load testing');
    await user.type(within(form).getByLabelText('Due'), '2026-10-30');
    await user.click(within(form).getByRole('button', { name: 'Add task' }));
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        route: 'add-task',
        body: {
          title: 'Load testing',
          assigneeId: null,
          dueDate: '2026-10-30',
        },
      }),
    );

    await user.selectOptions(
      within(tasks).getByRole('combobox', {
        name: 'Status of API integration',
      }),
      'DONE',
    );
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        route: 'edit-task',
        body: { status: 'DONE' },
      }),
    );

    await user.click(
      within(tasks).getByRole('button', {
        name: 'Remove task API integration',
      }),
    );
    await waitFor(() => expect(sent.at(-1)?.route).toBe('remove-task'));
  });

  it('offers no editing to someone unrelated', async () => {
    renderEditing(
      {
        ...DIG_004,
        can: {
          changeStatus: [],
          override: false,
          edit: false,
          requestChange: false,
          editFields: [],
          changeObjectives: false,
          planMilestones: false,
          manageWork: false,
        },
      },
      `/initiatives/${DIG_004_ID}?tab=milestones`,
    );
    const tasks = await screen.findByRole('region', { name: 'Tasks' });
    expect(
      screen.queryByRole('button', { name: 'Edit details' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Edit / }),
    ).not.toBeInTheDocument();
    expect(
      within(tasks).queryByRole('button', { name: /Add task/ }),
    ).not.toBeInTheDocument();
    expect(within(tasks).getByText('In progress')).toBeVisible();
  });
});
