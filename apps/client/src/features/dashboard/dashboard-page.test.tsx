import {
  dashboardSchema,
  strategyMapSchema,
  type Dashboard,
} from '@sims/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import { fakeApi, json, problem } from '@/test/fake-api';
import { DASHBOARD, PILLAR_IDS, STRATEGY_MAP } from './dashboard.fixture';

function renderDashboard(
  options: {
    dashboard?: (url: URL) => Dashboard | Response;
    decide?: (body: unknown) => Response;
  } = {},
) {
  const api = fakeApi({
    signedIn: true,
    routes: {
      'GET /api/v1/dashboard': (_init, url) => {
        const result = options.dashboard?.(url) ?? DASHBOARD;
        return result instanceof Response ? result : json(200, result);
      },
      'GET /api/v1/plans/current/map': () => json(200, STRATEGY_MAP),
      [`POST /api/v1/decisions/${DASHBOARD.decisions.items[0]!.id}/decide`]: (
        init,
      ) =>
        options.decide?.(JSON.parse(String(init.body))) ??
        json(200, { ...DASHBOARD.decisions.items[0], outcome: 'APPROVED' }),
    },
  });
  const view = render(<App />);
  return { ...api, ...view, user: userEvent.setup() };
}

beforeEach(() => {
  setSession(null);
  window.history.replaceState(null, '', '/');
});

describe('Command Centre', () => {
  it('uses fixtures that satisfy the contract', () => {
    expect(dashboardSchema.safeParse(DASHBOARD).success).toBe(true);
    expect(strategyMapSchema.safeParse(STRATEGY_MAP).success).toBe(true);
  });

  it('shows every panel, accessibly', async () => {
    const { container } = renderDashboard();

    expect(
      await screen.findByRole('heading', {
        name: 'Strategy Execution Command Centre',
      }),
    ).toBeVisible();
    expect(document.title).toBe('Dashboard · SIMS');
    // Snapshot date in the organisation's time zone.
    expect(screen.getByText(/Snapshot as at 16 Oct/)).toBeVisible();

    // Cycle tracker: sponsor review is the current step.
    const cycle = screen.getByRole('region', { name: 'October cycle' });
    expect(
      within(cycle).getByText('29 of 32 in', { exact: false }),
    ).toBeVisible();
    expect(
      within(cycle).getByText('Sponsor review', { exact: false }).closest('li'),
    ).toHaveAttribute('aria-current', 'step');

    // Headline tiles.
    const tiles = screen.getByRole('region', { name: 'Headline figures' });
    expect(within(tiles).getByText('65.6% of portfolio')).toBeVisible();
    expect(within(tiles).getByText('Across 2 strategic pillars')).toBeVisible();

    // Pillar performance: two lenses, and "not measured" shown honestly.
    const pillars = screen.getByRole('region', {
      name: 'Strategic pillar performance',
    });
    expect(
      within(pillars).getByRole('meter', {
        name: 'Execution, Revenue Diversification',
      }),
    ).toHaveAttribute('aria-valuenow', '96');
    expect(
      within(pillars).getByText(
        'Strategic impact, Digital Transformation: not measured yet',
      ),
    ).toBeInTheDocument();

    // Matrix, watchlist, escalations, milestones.
    expect(
      screen.getByText(
        '26 initiatives with live impact KPIs · 6 not yet measurable',
      ),
    ).toBeVisible();
    const watchlist = screen.getByRole('region', {
      name: 'Initiative monitoring',
    });
    expect(within(watchlist).getByText('Delayed')).toBeVisible();
    expect(
      within(watchlist).getByRole('link', { name: 'View all 32' }),
    ).toBeVisible();
    expect(screen.getByText(/Open 21 days · MD\/CEO · EXCO/)).toBeVisible();
    expect(screen.getByText(/slipped 15 days/)).toBeVisible();
    expect(screen.getByText('1 milestone already overdue')).toBeVisible();

    expect(await axeViolations(container)).toEqual([]);
  });

  it('flags overdue decisions and only offers Review to the decision owner', async () => {
    renderDashboard();
    const panel = await screen.findByRole('region', {
      name: 'Decisions required',
    });
    expect(within(panel).getByText('3 days overdue')).toBeVisible();
    expect(within(panel).getByText('Due 18 Oct')).toBeVisible();
    expect(
      within(panel).getAllByRole('button', { name: /^Review/ }),
    ).toHaveLength(1);
    expect(
      within(panel).getByText('Waiting for Strategy Office'),
    ).toBeVisible();
  });

  it('records a decision, asking for a reason when rejecting', async () => {
    const decided: unknown[] = [];
    const { user, calls } = renderDashboard({
      decide: (body) => {
        decided.push(body);
        return json(200, {
          ...DASHBOARD.decisions.items[0],
          outcome: 'REJECTED',
        });
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Review CR-0142' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Approving applies the change to the baseline.'),
    ).toBeVisible();

    await user.click(within(dialog).getByLabelText('Reject'));
    await user.click(
      within(dialog).getByRole('button', { name: 'Record decision' }),
    );
    expect(
      await within(dialog).findByText('Say why (5+ characters)'),
    ).toBeVisible();
    expect(decided).toEqual([]);

    await user.type(
      within(dialog).getByLabelText(/Notes/),
      'Scope must be cut first',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Record decision' }),
    );

    await screen.findByRole('heading', {
      name: 'Strategy Execution Command Centre',
    });
    expect(decided).toEqual([
      { outcome: 'REJECTED', notes: 'Scope must be cut first' },
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The dashboard is refreshed after deciding.
    expect(
      calls.filter((c) => c.startsWith('GET /api/v1/dashboard')).length,
    ).toBeGreaterThan(1);
  });

  it('shows why a decision failed without closing the dialog', async () => {
    const { user } = renderDashboard({
      decide: () =>
        problem(409, 'DECISION_CLOSED', 'This decision was already recorded.'),
    });
    await user.click(
      await screen.findByRole('button', { name: 'Review CR-0142' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Record decision' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This decision was already recorded.',
    );
  });

  it('narrows to one pillar through the View selector, kept in the URL', async () => {
    const { user, calls } = renderDashboard({
      dashboard: (url) =>
        url.searchParams.get('elementId') === PILLAR_IDS.digital
          ? {
              ...DASHBOARD,
              scope: {
                id: PILLAR_IDS.digital,
                code: 'P2',
                title: 'Digital Transformation',
              },
              performance: [],
            }
          : DASHBOARD,
    });
    const select = await screen.findByRole('combobox', { name: 'View' });
    await screen.findByRole('option', {
      name: 'Pillar: Digital Transformation',
    });

    await user.selectOptions(select, PILLAR_IDS.digital);

    expect(
      await screen.findByText('P2 · Digital Transformation'),
    ).toBeVisible();
    expect(window.location.search).toBe(`?elementId=${PILLAR_IDS.digital}`);
    expect(calls).toContain(
      `GET /api/v1/dashboard?elementId=${PILLAR_IDS.digital}`,
    );
    expect(
      screen.getByRole('heading', { name: 'Objective performance' }),
    ).toBeVisible();
  });

  // Server errors are retried twice (1 s, then 2 s) before the error shows.
  it(
    'offers a retry when the dashboard cannot load',
    { timeout: 15_000 },
    async () => {
      let attempts = 0;
      const { user } = renderDashboard({
        dashboard: () =>
          // The first try and both automatic retries fail; the manual retry works.
          ++attempts <= 3 ? problem(503, 'UNAVAILABLE', 'Down') : DASHBOARD,
      });
      // Server errors are retried automatically before giving up.
      expect(
        await screen.findByText(
          'The dashboard could not be loaded',
          {},
          { timeout: 5000 },
        ),
      ).toBeVisible();
      expect(attempts).toBe(3);
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(
        await screen.findByText('Strategy Execution Command Centre'),
      ).toBeVisible();
    },
  );
});
