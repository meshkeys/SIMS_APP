import { elementDetailSchema, strategyMapSchema } from '@sims/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import { fakeApi, json, problem, SESSION } from '@/test/fake-api';
import { IDS, MAP, O11_DETAIL } from './strategy.fixture';

function renderMap(
  path = '/strategy',
  options: {
    roles?: (typeof SESSION.session.membership.roles)[number][];
    map?: () => Response;
    create?: (body: unknown) => Response;
  } = {},
) {
  window.history.replaceState(null, '', path);
  const created: unknown[] = [];
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
      'GET /api/v1/plans/current/map': () => options.map?.() ?? json(200, MAP),
      [`GET /api/v1/elements/${IDS.o11}`]: () => json(200, O11_DETAIL),
      // The objective the add-dialog test creates.
      [`GET /api/v1/elements/${IDS.o12}`]: () =>
        json(200, { ...O11_DETAIL, id: IDS.o12, title: 'New objective' }),
      [`POST /api/v1/plans/${IDS.plan}/elements`]: (init) => {
        const body: unknown = JSON.parse(String(init.body));
        created.push(body);
        return (
          options.create?.(body) ??
          json(201, { ...O11_DETAIL, id: IDS.o12, title: 'New objective' })
        );
      },
    },
  });
  return { ...api, created, ...render(<App />), user: userEvent.setup() };
}

beforeEach(() => setSession(null));

describe('Strategy map', () => {
  it('uses fixtures that satisfy the contract', () => {
    expect(strategyMapSchema.safeParse(MAP).success).toBe(true);
    expect(elementDetailSchema.safeParse(O11_DETAIL).success).toBe(true);
  });

  it('shows the plan as pillars holding objectives, in the plan’s own words', async () => {
    const { container } = renderMap();

    expect(
      await screen.findByRole('heading', {
        name: 'From strategy to execution',
      }),
    ).toBeVisible();
    expect(document.title).toBe('Strategy map · SIMS');
    expect(screen.getByText(/v3 approved 12 Jan 2026/)).toBeVisible();
    expect(
      screen.getByText(/Pillar → Objective → KPI → initiative/),
    ).toBeVisible();

    const banner = screen.getByRole('region', { name: 'Strategic aspiration' });
    expect(within(banner).getByText(/most trusted diversified/)).toBeVisible();
    expect(
      within(banner).getByText('Objectives').closest('div'),
    ).toHaveTextContent('3');

    expect(screen.getByText('Pillar 01')).toBeVisible();
    expect(screen.getByText('Sponsor: ED, Business')).toBeVisible();
    // Headline KPIs in natural units, health in words.
    expect(screen.getByText('Non-interest income: 18% → 30%')).toBeVisible();
    expect(
      screen.getByText('Institutional clients: 40 clients → 120 clients'),
    ).toBeVisible();
    expect(screen.getByText(/5 initiatives · off track/)).toBeVisible();

    expect(
      screen.getByText('Select any objective to see what is delivering it'),
    ).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('opens an objective’s KPIs and contributors, kept in the URL', async () => {
    const { user, container } = renderMap();
    await user.click(
      await screen.findByRole('link', {
        name: /Grow non-interest income share/,
      }),
    );

    const panel = await screen.findByRole('region', {
      name: 'Grow non-interest income share',
    });
    expect(window.location.search).toBe(`?element=${IDS.o11}`);
    expect(
      screen.getByRole('link', { name: /Grow non-interest income share/ }),
    ).toHaveAttribute('aria-current', 'page');

    expect(
      within(panel).getByText('Objective owner: Head, Business Development'),
    ).toBeVisible();
    const row = within(panel).getByRole('row', {
      name: /Non-interest income share/,
    });
    expect(within(row).getByText('23%')).toBeVisible();
    expect(within(row).getByText('FY2026')).toBeVisible();
    expect(within(row).getByRole('meter')).toHaveAttribute(
      'aria-valuenow',
      '42',
    );

    expect(within(panel).getByText('Primary contributor · 50%')).toBeVisible();
    expect(within(panel).getByText('At risk')).toBeVisible();
    expect(
      within(panel).getByText('1 restricted initiative not shown.'),
    ).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('lets the Strategy Office add an objective under a pillar', async () => {
    const { user, created } = renderMap();
    await user.click(
      await screen.findByRole('button', { name: 'Add objective' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Add objective' });

    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByText('Required')).toBeVisible();

    await user.selectOptions(
      within(dialog).getByLabelText('Under'),
      within(dialog).getByRole('option', {
        name: /P2 · Digital Transformation/,
      }),
    );
    await user.type(
      within(dialog).getByLabelText(/Title/),
      'Modernise core platforms',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    await screen.findByRole('region', { name: 'New objective' });
    // Blank optional fields are omitted (code) or cleared (description).
    expect(created).toEqual([
      {
        parentId: IDS.digital,
        title: 'Modernise core platforms',
        description: null,
      },
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides editing from people who cannot change the plan', async () => {
    renderMap('/strategy', { roles: ['INITIATIVE_OWNER'] });
    await screen.findByRole('heading', { name: 'From strategy to execution' });
    expect(
      screen.queryByRole('button', { name: /Add/ }),
    ).not.toBeInTheDocument();
  });

  it('explains when there is no plan yet', async () => {
    renderMap('/strategy', {
      map: () =>
        problem(404, 'NO_PLAN', 'This organisation has no strategic plan yet.'),
    });
    expect(await screen.findByText('No strategic plan yet')).toBeVisible();
  });
});
