import type { KpiActualsSheet, Performance } from '@sims/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import { fakeApi, json, problem, SESSION } from '@/test/fake-api';
import {
  HASSAN,
  K01,
  K05,
  K13,
  LOCKED_PERIOD_ID,
  PERFORMANCE,
  PERIOD_ID,
  PERIODS,
  SHEET,
} from './performance.fixture';

type Role = (typeof SESSION.session.membership.roles)[number];

function renderApp(
  options: {
    path?: string;
    performance?: Performance;
    sheet?: KpiActualsSheet;
    as?: { membershipId: string; roles: Role[] };
  } = {},
) {
  window.history.replaceState(null, '', options.path ?? '/performance');
  const sent: { route: string; body: unknown }[] = [];
  const sheetUrl = `/api/v1/periods/${PERIOD_ID}/kpi-actuals`;
  const api = fakeApi({
    signedIn: true,
    session: options.as
      ? {
          ...SESSION,
          session: {
            ...SESSION.session,
            membership: {
              ...SESSION.session.membership,
              id: options.as.membershipId,
              roles: options.as.roles,
            },
          },
        }
      : undefined,
    routes: {
      'GET /api/v1/performance': (_init, url) =>
        json(200, {
          ...(options.performance ?? PERFORMANCE),
          ...(url.searchParams.get('year')
            ? { year: Number(url.searchParams.get('year')) }
            : {}),
        }),
      'GET /api/v1/periods': () => json(200, PERIODS),
      [`GET ${sheetUrl}`]: () => json(200, options.sheet ?? SHEET),
      [`GET /api/v1/periods/${LOCKED_PERIOD_ID}/kpi-actuals`]: () =>
        json(200, {
          ...SHEET,
          period: {
            ...SHEET.period,
            id: LOCKED_PERIOD_ID,
            name: 'September 2026',
            status: 'LOCKED',
          },
          rows: SHEET.rows.map((r) => ({
            ...r,
            can: { record: false, verify: false },
          })),
          open: false,
        } satisfies KpiActualsSheet),
      [`PUT ${sheetUrl}`]: (init) => {
        const body = JSON.parse(String(init.body)) as {
          actuals: { kpiId: string; value: number }[];
        };
        sent.push({ route: 'record', body });
        return json(200, {
          ...SHEET,
          rows: SHEET.rows.map((r) => {
            const entry = body.actuals.find((a) => a.kpiId === r.kpi.id);
            return entry
              ? {
                  ...r,
                  actual: {
                    value: entry.value,
                    commentary: null,
                    verified: true,
                    recordedBy: null,
                    verifiedBy: null,
                  },
                }
              : r;
          }),
          counts: {
            kpis: 3,
            recorded: 1 + body.actuals.length,
            verified: body.actuals.length,
          },
        } satisfies KpiActualsSheet);
      },
      [`POST ${sheetUrl}/verify`]: (init) => {
        sent.push({ route: 'verify', body: JSON.parse(String(init.body)) });
        return json(200, {
          ...SHEET,
          rows: SHEET.rows.map((r) =>
            r.actual
              ? {
                  ...r,
                  actual: { ...r.actual, verified: true },
                  can: { record: true, verify: false },
                }
              : r,
          ),
          counts: { kpis: 3, recorded: 1, verified: 1 },
        } satisfies KpiActualsSheet);
      },
    },
  });
  return { ...api, sent, ...render(<App />), user: userEvent.setup() };
}

beforeEach(() => setSession(null));

describe('KPIs & benefits realisation', () => {
  it('shows the headline figures, the benefits chart, low-value work and the scorecard', async () => {
    const { container } = renderApp();

    expect(
      await screen.findByRole('heading', {
        name: 'KPIs & benefits realisation',
      }),
    ).toBeVisible();
    const tiles = screen.getByRole('region', { name: 'Headline figures' });
    expect(within(tiles).getByText('Expected benefits, FY2026')).toBeVisible();
    expect(within(tiles).getByText('₦4.2bn')).toBeVisible();
    expect(within(tiles).getByText('70% of YTD expectation')).toBeVisible();
    expect(within(tiles).getByText('9 / 18')).toBeVisible();
    expect(within(tiles).getByText('4 off trajectory')).toBeVisible();

    const chart = screen.getByRole('region', {
      name: 'Expected vs realised benefits',
    });
    expect(
      within(chart).getByText(
        'Realisation is falling behind from Q3: 57% of expected value captured against 87% in Q1.',
      ),
    ).toBeVisible();
    expect(within(chart).getByRole('img')).toHaveAccessibleName(
      /Expected versus realised benefits by quarter, FY2026/,
    );

    const lowValue = screen.getByRole('region', {
      name: 'Delivered, but not creating value',
    });
    expect(
      within(lowValue).getByText('Active users 35% of target'),
    ).toBeVisible();
    // No summary: the score is shown instead.
    expect(within(lowValue).getByText('40% of target')).toBeVisible();
    expect(
      within(lowValue).getByRole('link', {
        name: 'Review the business case of DIG-020',
      }),
    ).toHaveAttribute(
      'href',
      '/initiatives/0192a1b2-c3d4-7e5f-8a9b-000000000502',
    );

    const scorecard = screen.getByRole('table', { name: /Strategic KPIs/ });
    const k01 = within(scorecard).getByRole('row', {
      name: /Non-interest income share/,
    });
    expect(within(k01).getByText('18%')).toBeVisible();
    expect(within(k01).getByText('30%')).toBeVisible();
    expect(within(k01).getByText('Slightly behind')).toBeVisible();
    expect(
      within(k01).getByText(
        'From 20.5% in April 2026 to 23% in September 2026',
      ),
    ).toBeInTheDocument();
    expect(
      within(scorecard).getByRole('columnheader', { name: 'FY2026 target' }),
    ).toBeVisible();
    expect(
      screen.getByText('9 of 18 KPIs on or above trajectory'),
    ).toBeVisible();

    expect(await axeViolations(container)).toEqual([]);
  });

  it('switches the year through the URL', async () => {
    const { user, calls } = renderApp();
    const period = await screen.findByRole('combobox', { name: 'Period' });
    expect(period).toHaveDisplayValue('FY2026 YTD');

    await user.selectOptions(period, 'FY2025');

    expect(window.location.search).toBe('?year=2025');
    await screen.findByText('Expected benefits, FY2025');
    expect(calls).toContain('GET /api/v1/performance?year=2025');
  });

  it('explains an empty year instead of drawing an empty chart', async () => {
    renderApp({
      performance: {
        ...PERFORMANCE,
        benefits: {
          ...PERFORMANCE.benefits,
          expected: 0,
          expectedToDate: 0,
          realisedToDate: 0,
          realisedPctOfExpected: null,
          quarters: PERFORMANCE.benefits.quarters.map((q) => ({
            ...q,
            expected: 0,
            realised: null,
            forecast: null,
            captureRate: null,
          })),
        },
        lowValue: { thresholdPct: 50, count: 0, items: [] },
      },
    });
    expect(
      await screen.findByText('No financial benefits expected in FY2026'),
    ).toBeVisible();
    expect(screen.getByText('No quarter has ended yet')).toBeVisible();
    expect(
      within(
        screen.getByRole('region', {
          name: 'Delivered, but not creating value',
        }),
      ).getByText('Nothing to review'),
    ).toBeVisible();
  });

  it('offers Record KPI actuals only to those who can record', async () => {
    renderApp({
      performance: { ...PERFORMANCE, can: { recordKpiActuals: false } },
    });
    await screen.findByRole('heading', { name: 'KPIs & benefits realisation' });
    expect(
      screen.queryByRole('link', { name: 'Record KPI actuals' }),
    ).not.toBeInTheDocument();
  });
});

describe('Record KPI actuals', () => {
  it('opens on the current period with each KPI’s previous reading and target', async () => {
    const { user, container } = renderApp();
    await user.click(
      await screen.findByRole('link', { name: 'Record KPI actuals' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'October 2026 readings' }),
    ).toBeVisible();
    expect(screen.getByText('1 of 3 recorded · 0 verified')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Period' })).toHaveDisplayValue(
      'October 2026',
    );
    const k05 = screen.getByRole('row', { name: /Digital transaction share/ });
    expect(within(k05).getByText('58%')).toBeVisible();
    expect(within(k05).getByText('75%')).toBeVisible();
    expect(within(k05).getByText('Awaiting verification')).toBeVisible();
    expect(
      within(k05).getByRole('textbox', {
        name: 'October 2026 reading for K05 Digital transaction share (%)',
      }),
    ).toHaveValue('66');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('saves only the readings that changed', async () => {
    const { user, sent } = renderApp({ path: '/performance/actuals' });
    const k01 = await screen.findByRole('textbox', {
      name: 'October 2026 reading for K01 Non-interest income share (%)',
    });
    expect(
      screen.getByRole('button', { name: 'Save readings' }),
    ).toBeDisabled();

    await user.type(k01, '24.5');
    await user.type(
      screen.getByRole('textbox', {
        name: 'Note for K01 Non-interest income share',
      }),
      'Fee repricing landed',
    );
    await user.click(screen.getByRole('button', { name: 'Save 1 reading' }));

    expect(await screen.findByText('Saved 1 reading.')).toBeVisible();
    expect(sent).toEqual([
      {
        route: 'record',
        body: {
          actuals: [
            { kpiId: K01, value: 24.5, commentary: 'Fee repricing landed' },
          ],
        },
      },
    ]);
    expect(screen.getByText('2 of 3 recorded · 1 verified')).toBeVisible();
  });

  it('checks readings before saving', async () => {
    const { user, sent } = renderApp({ path: '/performance/actuals' });
    const k13 = await screen.findByRole('textbox', {
      name: 'October 2026 reading for K13 Net Promoter Score (score)',
    });
    await user.type(k13, 'about 30');
    await user.click(screen.getByRole('button', { name: 'Save 1 reading' }));

    expect(k13).toHaveAccessibleDescription('Enter a number, like 23.5');
    expect(screen.getByText('Check the highlighted readings')).toBeVisible();
    expect(sent).toEqual([]);
  });

  it('verifies what an owner entered', async () => {
    const { user, sent } = renderApp({ path: '/performance/actuals' });
    await user.click(await screen.findByRole('button', { name: 'Verify K05' }));

    expect(await screen.findByText('Verified 1 reading.')).toBeVisible();
    expect(sent).toEqual([{ route: 'verify', body: { kpiIds: [K05] } }]);
    expect(
      within(
        screen.getByRole('row', { name: /Digital transaction share/ }),
      ).getByText('Verified'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Verify all/ }),
    ).not.toBeInTheDocument();
  });

  it('shows owners only their KPIs and leaves verifying to the Strategy Office', async () => {
    renderApp({
      path: '/performance/actuals',
      as: { membershipId: HASSAN.membershipId, roles: ['INITIATIVE_OWNER'] },
      sheet: {
        ...SHEET,
        rows: SHEET.rows.map((r) => ({
          ...r,
          can: { record: r.kpi.id === K05, verify: false },
        })),
      },
    });

    expect(
      await screen.findByRole('row', { name: /Digital transaction share/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole('row', { name: /Net Promoter Score/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Verify/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Enter the readings for the KPIs you own/),
    ).toBeVisible();
    expect(K13).toBeTruthy();
  });

  it('shows a locked period read-only', async () => {
    renderApp({ path: `/performance/actuals?period=${LOCKED_PERIOD_ID}` });

    expect(await screen.findByText('September 2026 is locked')).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Save/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('66%')).toBeVisible();
  });

  it('says why a save failed', async () => {
    const { user, fetchMock } = renderApp({ path: '/performance/actuals' });
    const k01 = await screen.findByRole('textbox', {
      name: 'October 2026 reading for K01 Non-interest income share (%)',
    });
    fetchMock.mockImplementationOnce(async () =>
      problem(
        409,
        'PERIOD_LOCKED',
        'October 2026 is locked; its KPI readings are part of the record.',
      ),
    );
    await user.type(k01, '25');
    await user.click(screen.getByRole('button', { name: 'Save 1 reading' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'October 2026 is locked; its KPI readings are part of the record.',
    );
  });
});
