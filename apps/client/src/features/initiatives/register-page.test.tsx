import { registerPageSchema, type RegisterPage } from '@sims/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import { fakeApi, json } from '@/test/fake-api';
import { STRATEGY_MAP } from '../dashboard/dashboard.fixture';
import { ITEMS, page } from './register.fixture';

/** Renders the register; `respond` decides the page for each query. */
function renderRegister(
  path = '/initiatives',
  respond: (query: URLSearchParams) => RegisterPage = (query) =>
    page(ITEMS, { page: Number(query.get('page') ?? 1) }),
) {
  window.history.replaceState(null, '', path);
  const queries: URLSearchParams[] = [];
  const api = fakeApi({
    signedIn: true,
    routes: {
      'GET /api/v1/initiatives': (_init, url) => {
        queries.push(url.searchParams);
        return json(200, respond(url.searchParams));
      },
      'GET /api/v1/plans/current/map': () => json(200, STRATEGY_MAP),
    },
  });
  const last = () => queries.at(-1)!;
  return { ...api, last, ...render(<App />), user: userEvent.setup() };
}

beforeEach(() => setSession(null));

describe('Initiative register', () => {
  it('uses fixtures that satisfy the contract', () => {
    expect(registerPageSchema.safeParse(page()).success).toBe(true);
  });

  it('lists initiatives with execution, health, impact and updates', async () => {
    const { container, last } = renderRegister();

    const table = await screen.findByRole('table');
    expect(document.title).toBe('Initiative register · SIMS');
    expect(last().toString()).toBe('tab=active&sort=health&page=1&pageSize=10');

    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4); // header + 3
    const first = rows[1]!;
    expect(within(first).getByText('DIG-007')).toBeVisible();
    expect(
      within(first).getByRole('link', { name: 'Automate Customer Onboarding' }),
    ).toHaveAttribute('href', `/initiatives/${ITEMS[0]!.id}`);
    expect(within(first).getByText('-60 pp vs plan')).toBeVisible();
    expect(within(first).getByText('Delayed')).toBeVisible();
    expect(within(first).getByText('Not yet measurable')).toBeVisible();
    expect(within(first).getByText('2 Oct · overdue')).toBeVisible();
    expect(
      within(rows[2]!).getByText('Pilot revenue 10% of target'),
    ).toBeVisible();
    expect(within(rows[3]!).getByText('72% of target')).toBeVisible();
    expect(within(rows[3]!).getByText('Restricted')).toBeVisible();

    // Tabs and chips carry their counts.
    expect(
      screen.getByRole('button', { name: 'Pipeline · 5 awaiting approval' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Active · 32' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'All · 32' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Page 1 of 4')).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('filters by health, and the filter is in the URL', async () => {
    const { user, last } = renderRegister();
    await user.click(
      await screen.findByRole('button', { name: 'Delayed · 4' }),
    );

    await waitFor(() => expect(last().get('health')).toBe('RED'));
    expect(window.location.search).toBe('?health=RED');
    expect(screen.getByRole('button', { name: 'Delayed · 4' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Pressing it again clears it.
    await user.click(screen.getByRole('button', { name: 'Delayed · 4' }));
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('opens pre-filtered from a dashboard tile link', async () => {
    const { last } = renderRegister('/initiatives?health=AMBER');
    expect(
      await screen.findByRole('button', { name: 'At risk · 7' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(last().get('health')).toBe('AMBER');
  });

  it('searches after a pause in typing, without filling the history', async () => {
    const { user, last } = renderRegister();
    const before = window.history.length;
    await user.type(
      await screen.findByRole('searchbox', { name: 'Search initiatives' }),
      'onboarding',
    );
    await waitFor(() => expect(last().get('q')).toBe('onboarding'));
    expect(window.location.search).toBe('?q=onboarding');
    expect(window.history.length).toBe(before);
  });

  it('keeps a space typed just before a pause', async () => {
    const { user, last } = renderRegister();
    const box = await screen.findByRole('searchbox', {
      name: 'Search initiatives',
    });
    await user.type(box, 'core ');
    // The URL catches up with "core" while the person is still typing.
    await waitFor(() => expect(last().get('q')).toBe('core'));
    await user.type(box, 'banking');
    expect(box).toHaveValue('core banking');
    await waitFor(() => expect(last().get('q')).toBe('core banking'));
  });

  it('switches tab, resetting the health filter', async () => {
    const { user, last } = renderRegister('/initiatives?health=RED');
    await user.click(
      await screen.findByRole('button', {
        name: 'Pipeline · 5 awaiting approval',
      }),
    );
    await waitFor(() => expect(last().get('tab')).toBe('pipeline'));
    expect(last().get('health')).toBeNull();
    expect(window.location.search).toBe('?tab=pipeline');
  });

  it('pages through the results, and new filters return to page 1', async () => {
    const { user, last } = renderRegister();
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(last().get('page')).toBe('2'));
    expect(await screen.findByText('Page 2 of 4')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Sort' }),
      'variance',
    );
    await waitFor(() => expect(last().get('sort')).toBe('variance'));
    expect(last().get('page')).toBe('1');
  });

  it('narrows to one pillar', async () => {
    const { user, last } = renderRegister();
    const select = await screen.findByRole('combobox', { name: 'Pillar' });
    await screen.findByRole('option', { name: 'Digital Transformation' });
    await user.selectOptions(select, 'Digital Transformation');
    await waitFor(() =>
      expect(last().get('elementId')).toBe(STRATEGY_MAP.elements[1]!.id),
    );
  });

  it('offers to clear filters when nothing matches', async () => {
    const { user } = renderRegister('/initiatives?health=RED&q=zzz', (query) =>
      query.get('q') ? page([], { total: 0, totalPages: 1 }) : page(ITEMS),
    );
    expect(
      await screen.findByText('No initiatives match these filters'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByRole('table')).toBeVisible();
    expect(window.location.search).toBe('');
  });

  it('ignores broken filter values in an edited link', async () => {
    const { last } = renderRegister(
      '/initiatives?health=PURPLE&page=abc&sort=nope',
    );
    await screen.findByRole('table');
    expect(last().toString()).toBe('tab=active&sort=health&page=1&pageSize=10');
  });
});
