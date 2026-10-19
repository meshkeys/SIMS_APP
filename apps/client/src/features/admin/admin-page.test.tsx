import type { RulesetsOverview } from '@sims/contracts';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import { fakeApi, json, SESSION } from '@/test/fake-api';
import { IMPACT, OVERVIEW, PENDING } from './admin.fixture';

type Role = (typeof SESSION.session.membership.roles)[number];

function renderAdmin(
  options: { path?: string; roles?: Role[]; overview?: RulesetsOverview } = {},
) {
  window.history.replaceState(null, '', options.path ?? '/admin');
  const sent: { route: string; body: unknown }[] = [];
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
      'GET /api/v1/rulesets': () => json(200, options.overview ?? OVERVIEW),
      'POST /api/v1/rulesets/preview': (init) => {
        sent.push({ route: 'preview', body: JSON.parse(String(init.body)) });
        return json(200, IMPACT);
      },
      'POST /api/v1/rulesets': (init) => {
        sent.push({ route: 'propose', body: JSON.parse(String(init.body)) });
        return json(201, { ...PENDING, changes: IMPACT.changes });
      },
      [`POST /api/v1/rulesets/${PENDING.id}/withdraw`]: () => {
        sent.push({ route: 'withdraw', body: null });
        return json(200, {
          ...PENDING,
          status: 'REJECTED',
          can: { withdraw: false },
        });
      },
    },
  });
  return { ...api, sent, ...render(<App />), user: userEvent.setup() };
}

const slider = (name: string) =>
  screen.getByRole('slider', { name: new RegExp(`^${name}`) });

beforeEach(() => setSession(null));

describe('Administration: rules', () => {
  it('shows the live RAG and health rules', async () => {
    const { container } = renderAdmin();

    expect(
      await screen.findByText('Ruleset v4 · approved 12 Jan 2026'),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Administration' }),
    ).toBeVisible();
    expect(slider('Green up to')).toHaveValue('5');
    expect(slider('Amber up to')).toHaveValue('15');
    expect(
      screen.getByRole('checkbox', {
        name: /An overdue critical milestone forces Red/,
      }),
    ).toBeChecked();
    expect(
      screen.getByRole('spinbutton', { name: 'Manual overrides expire after' }),
    ).toHaveValue(30);
    expect(
      screen.getByRole('combobox', { name: 'Who can override' }),
    ).toHaveDisplayValue('Executive sponsor or above');
    // Nothing changed yet, so nothing to propose.
    expect(
      screen.queryByRole('region', { name: 'Proposed changes' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /RAG & health rules/ }),
    ).toHaveAttribute('aria-current', 'page');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('previews a change on today’s portfolio and proposes it for approval', async () => {
    const { user, sent } = renderAdmin();
    await screen.findByText('Ruleset v4 · approved 12 Jan 2026');

    fireEvent.change(slider('Green up to'), { target: { value: '10' } });

    const panel = await screen.findByRole('region', {
      name: 'Proposed changes',
    });
    expect(within(panel).getByText('Green up to: 5 pp → 10 pp')).toBeVisible();
    const impact = await within(panel).findByRole('region', {
      name: /Impact on today/,
    });
    expect(
      within(impact).getByRole('row', { name: /Live rules 21 7 4 0/ }),
    ).toBeVisible();
    expect(
      within(impact).getByRole('row', { name: /Proposed 23 5 4 0/ }),
    ).toBeVisible();
    expect(within(impact).getByText(/Payment Switch Upgrade/)).toBeVisible();
    expect(sent.find((s) => s.route === 'preview')).toMatchObject({
      body: { config: { rag: { greenMaxPpBehind: 10, amberMaxPpBehind: 15 } } },
    });

    const propose = within(panel).getByRole('button', {
      name: 'Propose for approval',
    });
    expect(propose).toBeDisabled();
    await user.type(
      within(panel).getByRole('textbox', { name: /Why change the rules/ }),
      'Align Green with the FY2027 tolerance.',
    );
    await user.click(propose);

    expect(
      await screen.findByText(
        'Version 5 was sent to the MD/CEO for approval. It takes effect once approved.',
      ),
    ).toBeVisible();
    expect(sent.find((s) => s.route === 'propose')).toMatchObject({
      body: {
        config: { rag: { greenMaxPpBehind: 10 } },
        changeSummary: 'Align Green with the FY2027 tolerance.',
      },
    });
  });

  it('checks the rules with the same schema as the server', async () => {
    const { sent } = renderAdmin();
    await screen.findByText('Ruleset v4 · approved 12 Jan 2026');

    fireEvent.change(slider('Amber up to'), { target: { value: '3' } });

    expect(
      await screen.findByText(
        'The Amber limit must be greater than the Green limit',
      ),
    ).toBeVisible();
    const panel = screen.getByRole('region', { name: 'Proposed changes' });
    expect(
      within(panel).getByText(
        'Fix the highlighted settings to see their impact.',
      ),
    ).toBeVisible();
    expect(
      within(panel).getByRole('button', { name: 'Propose for approval' }),
    ).toBeDisabled();
    expect(sent.filter((s) => s.route === 'preview')).toEqual([]);
  });

  it('discards edits back to the live rules', async () => {
    const { user } = renderAdmin();
    await screen.findByText('Ruleset v4 · approved 12 Jan 2026');
    await user.click(
      screen.getByRole('checkbox', { name: /A missed update makes health/ }),
    );
    const panel = await screen.findByRole('region', {
      name: 'Proposed changes',
    });
    expect(
      within(panel).getByText('Missed update makes health Unknown: on → off'),
    ).toBeVisible();

    await user.click(
      within(panel).getByRole('button', { name: 'Discard changes' }),
    );
    expect(
      screen.queryByRole('region', { name: 'Proposed changes' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: /A missed update makes health/ }),
    ).toBeChecked();
  });
});

describe('Administration: ladder, cycle and versions', () => {
  it('edits the escalation ladder', async () => {
    const { user } = renderAdmin({ path: '/admin?section=escalation' });
    const days = await screen.findByRole('spinbutton', {
      name: 'Level 2 arrives after days',
    });
    await user.clear(days);
    await user.type(days, '10');
    await user.click(screen.getByRole('button', { name: 'Add a level' }));
    expect(screen.getByRole('textbox', { name: 'Level 5 name' })).toHaveValue(
      'New level',
    );

    const panel = screen.getByRole('region', { name: 'Proposed changes' });
    expect(
      within(panel).getByText(
        /^Escalation ladder: .*after 10 days.*L5 New level/,
      ),
    ).toBeVisible();
  });

  it('flags windows that overlap', async () => {
    const { user } = renderAdmin({ path: '/admin?section=cycle' });
    const reviewFrom = (
      await screen.findAllByRole('spinbutton', { name: 'From day' })
    )[1]!;
    await user.clear(reviewFrom);
    await user.type(reviewFrom, '2');
    expect(
      await screen.findByText(
        'Stages must follow each other without overlapping',
      ),
    ).toBeVisible();
  });

  it('lists every version with who proposed and approved it', async () => {
    renderAdmin({ path: '/admin?section=versions' });
    const versions = await screen.findByRole('region', {
      name: 'Rule versions',
    });
    expect(within(versions).getByText('Version 4')).toBeVisible();
    expect(within(versions).getByText('Active')).toBeVisible();
    expect(
      within(versions).getByText(
        'Proposed by Amara Bello · approved by Adaeze Okafor · in force from 12 Jan 2026',
      ),
    ).toBeVisible();
    expect(within(versions).getByText('Superseded')).toBeVisible();
  });
});

describe('Administration: who can do what', () => {
  it('locks editing while a proposal waits, and lets the Strategy Office withdraw it', async () => {
    const { user, sent } = renderAdmin({
      overview: { ...OVERVIEW, pending: PENDING },
    });
    expect(
      await screen.findByText('Version 5 is waiting for MD/CEO approval'),
    ).toBeVisible();
    expect(
      screen.getByText('Overrides expire after: 30 days → 45 days'),
    ).toBeVisible();
    expect(slider('Green up to')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Withdraw proposal' }));
    await waitFor(() => expect(sent.map((s) => s.route)).toContain('withdraw'));
  });

  it('shows the MD/CEO the rules read-only', async () => {
    renderAdmin({
      roles: ['CEO'],
      overview: { ...OVERVIEW, can: { propose: false } },
    });
    expect(
      await screen.findByText(/The Strategy Office proposes rule changes/),
    ).toBeVisible();
    expect(slider('Green up to')).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Administration' })).toBeVisible();
  });

  it('keeps Administration out of the menu for everyone else', async () => {
    window.history.replaceState(null, '', '/');
    fakeApi({
      signedIn: true,
      session: {
        ...SESSION,
        session: {
          ...SESSION.session,
          membership: {
            ...SESSION.session.membership,
            roles: ['INITIATIVE_OWNER'],
          },
        },
      },
    });
    render(<App />);
    expect(
      await screen.findByRole('link', { name: 'Dashboard' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Administration' }),
    ).not.toBeInTheDocument();
  });
});
