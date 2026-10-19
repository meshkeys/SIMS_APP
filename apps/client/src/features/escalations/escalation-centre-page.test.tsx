import type { EscalationDetail } from '@sims/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import { fakeApi, json, SESSION } from '@/test/fake-api';
import {
  CELL_REGISTER,
  CENTRE,
  CORE_DETAIL,
  DECISION_LOG,
  DEPENDENCIES,
  ESC_CORE,
  REGISTER,
  RISK_SEC,
} from './escalations.fixture';

type Role = (typeof SESSION.session.membership.roles)[number];
const NEW_ID = '0192a1b2-c3d4-7e5f-8a9b-000000000399';

function renderCentre(options: { path?: string; roles?: Role[] } = {}) {
  window.history.replaceState(null, '', options.path ?? '/risks');
  const sent: { route: string; body: unknown }[] = [];
  const detail = `/api/v1/escalations/${ESC_CORE}`;
  const moved =
    (route: string, level: number, status = 'OPEN') =>
    (init: RequestInit) => {
      sent.push({ route, body: JSON.parse(String(init.body)) });
      return json(200, {
        ...CORE_DETAIL,
        level,
        levelName: level === 4 ? 'Board' : CORE_DETAIL.levelName,
        status,
        can: {
          escalate: false,
          deEscalate: false,
          resolve: false,
          withdraw: false,
        },
      } as EscalationDetail);
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
      // Only the Strategy Office may raise portfolio-level escalations.
      'GET /api/v1/escalations': () =>
        json(200, {
          ...CENTRE,
          can: { raisePortfolio: !options.roles },
        }),
      'GET /api/v1/risks': (_init, url) =>
        json(
          200,
          url.searchParams.get('likelihood') ? CELL_REGISTER : REGISTER,
        ),
      'GET /api/v1/dependencies': () => json(200, DEPENDENCIES),
      'GET /api/v1/decisions': () => json(200, DECISION_LOG),
      [`GET ${detail}`]: () => json(200, CORE_DETAIL),
      [`POST ${detail}/escalate`]: moved('escalate', 4),
      [`POST ${detail}/resolve`]: moved('resolve', 3, 'RESOLVED'),
      'POST /api/v1/escalations': (init) => {
        sent.push({ route: 'raise', body: JSON.parse(String(init.body)) });
        return json(201, { ...CORE_DETAIL, id: NEW_ID, reference: 'ESC-0019' });
      },
      [`GET /api/v1/escalations/${NEW_ID}`]: () =>
        json(200, { ...CORE_DETAIL, id: NEW_ID, reference: 'ESC-0019' }),
    },
  });
  return { ...api, sent, ...render(<App />), user: userEvent.setup() };
}

beforeEach(() => setSession(null));

describe('Escalation centre', () => {
  it('shows the ladder, the heatmap, open escalations, blocked dependencies and decisions', async () => {
    const { container } = renderCentre();

    expect(
      await screen.findByRole('heading', { name: 'Escalation centre' }),
    ).toBeVisible();
    expect(
      await screen.findByRole('button', {
        name: 'L3 MD/CEO · EXCO: 1 open escalation',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'L4 Board: 0 open escalations' }),
    ).toBeVisible();

    const table = screen.getByRole('table', { name: /3 open escalations/ });
    const core = within(table).getByRole('row', { name: /Core banking API/ });
    expect(within(core).getByText('Issue · critical')).toBeVisible();
    expect(within(core).getByText('21 days')).toHaveClass('text-danger');
    expect(within(core).getByText('Group Managing Director')).toBeVisible();
    expect(
      within(table).getByRole('row', { name: /October update not submitted/ }),
    ).toHaveTextContent('Update overdue');

    expect(
      await screen.findByText('30 open risks · select a cell to filter'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Likelihood 3, impact 3 (medium): 4 risks',
      }),
    ).toBeVisible();

    const dependencies = screen.getByRole('region', {
      name: 'Blocked dependencies',
    });
    expect(await within(dependencies).findByText('waiting on')).toBeVisible();
    expect(within(dependencies).getByText('Since 25 Sept')).toBeVisible();
    expect(within(dependencies).getByText('Needed by 1 Nov')).toBeVisible();

    const log = screen.getByRole('region', { name: 'Decision log' });
    expect(await within(log).findByText('Approved')).toHaveClass(
      'text-success',
    );
    expect(within(log).getByText('Deferred')).toBeVisible();

    expect(await axeViolations(container)).toEqual([]);
  });

  it('filters the escalations by ladder level', async () => {
    const { user } = renderCentre();
    await user.click(
      await screen.findByRole('button', { name: /^L2 Executive sponsor/ }),
    );

    expect(window.location.search).toBe('?level=2');
    expect(
      screen.getByRole('heading', { name: 'Open escalations at L2' }),
    ).toBeVisible();
    expect(
      screen.getByRole('table', { name: /1 open escalation/ }),
    ).toHaveTextContent('Vendor contract unsigned');
    await user.click(screen.getByRole('button', { name: 'Show all levels' }));
    expect(
      screen.getByRole('table', { name: /3 open escalations/ }),
    ).toBeVisible();
  });

  it('opens an escalation with its history and escalates it with a reason', async () => {
    const { user, sent } = renderCentre();
    await user.click(
      await screen.findByRole('button', { name: 'Open ESC-0001' }),
    );

    const panel = await screen.findByRole('region', {
      name: 'ESC-0001 · Core banking API not ready for integration testing',
    });
    expect(within(panel).getByText('Moves up only by decision')).toBeVisible();
    expect(
      within(panel).getByText(
        'Raised as critical to L3 MD/CEO · EXCO by Amara Bello',
      ),
    ).toBeVisible();

    await user.click(
      within(panel).getByRole('button', { name: 'Escalate to Board' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Escalate ESC-0001 to Board',
    });
    const reason = within(dialog).getByRole('textbox', {
      name: 'Why it needs the next level',
    });
    await user.type(reason, 'Too short');
    await user.click(within(dialog).getByRole('button', { name: 'Escalate' }));
    expect(reason).toHaveAccessibleDescription('Write at least 10 characters');
    expect(sent).toEqual([]);

    await user.type(reason, ' — plan impact needs Board approval');
    await user.click(within(dialog).getByRole('button', { name: 'Escalate' }));

    expect(await screen.findByText('ESC-0001 moved to Board.')).toBeVisible();
    expect(sent).toEqual([
      {
        route: 'escalate',
        body: { note: 'Too short — plan impact needs Board approval' },
      },
    ]);
  });

  it('resolves an escalation', async () => {
    const { user, sent } = renderCentre({
      path: `/risks?escalation=${ESC_CORE}`,
    });
    const panel = await screen.findByRole('region', { name: /ESC-0001/ });
    await user.click(within(panel).getByRole('button', { name: 'Resolve' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Resolve ESC-0001',
    });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'How it was resolved' }),
      'Vendor delivered the sandbox fix.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Resolve' }));

    expect(await screen.findByText('ESC-0001 was resolved.')).toBeVisible();
    expect(sent).toEqual([
      {
        route: 'resolve',
        body: { resolution: 'Vendor delivered the sandbox fix.' },
      },
    ]);
    expect(within(panel).getByText('Resolved')).toBeVisible();
  });

  it('filters risks by heatmap cell and escalates one', async () => {
    const { user, sent, calls } = renderCentre();
    await user.click(
      await screen.findByRole('button', {
        name: 'Likelihood 3, impact 4 (high): 2 risks',
      }),
    );
    expect(window.location.search).toBe('?likelihood=3&impact=4');
    const cell = await screen.findByRole('region', {
      name: 'Risks at likelihood 3, impact 4',
    });
    expect(await within(cell).findByText('ESC-0005 · L1')).toBeVisible();
    expect(calls).toContain(
      'GET /api/v1/risks?type=RISK&likelihood=3&impact=4',
    );

    await user.click(
      within(cell).getByRole('button', {
        name: 'Escalate SEC product approval may slip',
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Escalate a risk',
    });
    expect(
      within(dialog).getByRole('textbox', {
        name: /What is blocking execution/,
      }),
    ).toHaveValue('SEC product approval may slip');
    await user.click(
      within(dialog).getByRole('button', { name: 'Raise escalation' }),
    );

    expect(
      await screen.findByRole('region', { name: /ESC-0019/ }),
    ).toBeVisible();
    expect(window.location.search).toContain(`escalation=${NEW_ID}`);
    expect(sent).toEqual([
      {
        route: 'raise',
        body: expect.objectContaining({
          riskIssueId: RISK_SEC,
          title: 'SEC product approval may slip',
          severity: 'HIGH',
        }),
      },
    ]);
  });

  it('asks owners which initiative an escalation is for', async () => {
    const { user, sent } = renderCentre({ roles: ['INITIATIVE_OWNER'] });
    await user.click(
      await screen.findByRole('button', { name: 'Raise escalation' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Raise an escalation',
    });
    await user.type(
      within(dialog).getByRole('textbox', {
        name: /What is blocking execution/,
      }),
      'Shared test environment down',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Raise escalation' }),
    );

    expect(
      await within(dialog).findByText('Choose the initiative it affects'),
    ).toBeVisible();
    expect(sent).toEqual([]);
  });

  it('keeps logging and raising for people who run initiatives', async () => {
    renderCentre({ roles: ['BOARD'] });
    await screen.findByRole('heading', { name: 'Escalation centre' });
    expect(
      screen.queryByRole('button', { name: 'Raise escalation' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Log risk or issue' }),
    ).not.toBeInTheDocument();
  });
});
