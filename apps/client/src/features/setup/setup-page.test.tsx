import type { OnboardingState, SessionResponse } from '@sims/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import { type FakeRoute, fakeApi, json, SESSION } from '@/test/fake-api';
import { IDS, MAP } from '../strategy/strategy.fixture';
import {
  AFTER_SIGNUP,
  SETUP_SESSION,
  TEMPLATES,
  WITH_PLAN,
} from './setup.fixture';

const body = (init: RequestInit) => JSON.parse(String(init.body)) as unknown;

function renderSetup(
  path: string,
  options: {
    state?: OnboardingState;
    session?: SessionResponse;
    routes?: Record<string, FakeRoute>;
  } = {},
) {
  setSession(null);
  window.history.replaceState(null, '', path);
  const sent: { route: string; body: unknown }[] = [];
  const record =
    (route: string, response: OnboardingState): FakeRoute =>
    (init) => {
      sent.push({ route, body: init.body ? body(init) : null });
      return json(200, response);
    };
  const api = fakeApi({
    signedIn: true,
    session: options.session ?? SETUP_SESSION,
    routes: {
      'GET /api/v1/onboarding': () => json(200, options.state ?? AFTER_SIGNUP),
      'GET /api/v1/framework-templates': () => json(200, TEMPLATES),
      [`GET /api/v1/plans/${IDS.plan}/map`]: () => json(200, MAP),
      'GET /api/v1/invitations': () => json(200, []),
      'PUT /api/v1/onboarding/organisation': record('organisation', {
        ...AFTER_SIGNUP,
        step: 1,
      }),
      'PUT /api/v1/onboarding/framework': record('framework', WITH_PLAN),
      'PUT /api/v1/onboarding/vision': record('vision', {
        ...WITH_PLAN,
        step: 3,
      }),
      'PUT /api/v1/onboarding/governance': record('governance', {
        ...WITH_PLAN,
        step: 4,
        missing: [],
      }),
      ...options.routes,
    },
  });
  return { ...api, sent, ...render(<App />), user: userEvent.setup() };
}

beforeEach(() => setSession(null));

describe('Workspace set-up', () => {
  it('opens for a new workspace, at the step after the last one saved', async () => {
    const { container } = renderSetup('/');

    expect(
      await screen.findByRole('heading', {
        name: 'How is your strategy structured?',
      }),
    ).toBeVisible();
    expect(window.location.pathname).toBe('/setup');
    expect(screen.getByText('Step 2 of 5')).toBeVisible();
    const steps = within(
      screen.getByRole('navigation', { name: 'Set-up steps' }),
    );
    expect(steps.getByRole('link', { name: /Organisation/ })).toHaveTextContent(
      '(saved)',
    );
    expect(
      steps.getByRole('link', { name: /Strategy framework/ }),
    ).toHaveAttribute('aria-current', 'step');
    // Later steps open once the ones before are saved.
    expect(steps.queryByRole('link', { name: /Governance/ })).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('lets other roles use the workspace while it is set up', async () => {
    renderSetup('/', {
      session: {
        ...SETUP_SESSION,
        session: {
          ...SETUP_SESSION.session,
          membership: {
            ...SETUP_SESSION.session.membership,
            roles: ['INITIATIVE_OWNER'],
          },
        },
      },
    });

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(
      screen.queryByRole('heading', {
        name: 'How is your strategy structured?',
      }),
    ).toBeNull();
  });

  it('names the levels and terms, previews them, and saves the framework', async () => {
    const { user, sent } = renderSetup('/setup');

    const top = await screen.findByRole('textbox', { name: 'Level 1 name' });
    expect(top).toHaveValue('Strategic pillar');
    expect(screen.getByText('Recommended for private companies')).toBeVisible();

    await user.clear(top);
    await user.type(top, 'Strategic theme');
    const kpi = screen.getByRole('textbox', { name: 'What you call KPIs' });
    await user.clear(kpi);
    await user.type(kpi, 'Outcome indicator');

    const preview = within(
      screen.getByRole('region', { name: 'Live preview' }),
    );
    expect(preview.getByText('Strategic theme')).toBeVisible();
    expect(preview.getByText('Outcome indicator')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Vision, mission and plan period',
      }),
    ).toBeVisible();
    expect(sent).toContainEqual({
      route: 'framework',
      body: {
        template: 'STRATEGIC_PILLARS',
        levels: [
          {
            label: 'Strategic theme',
            pluralLabel: 'Strategic themes',
            codePrefix: 'ST',
            allowsKpis: false,
          },
          {
            label: 'Strategic objective',
            pluralLabel: 'Strategic objectives',
            codePrefix: 'O',
            allowsKpis: true,
          },
        ],
        terminology: {
          kpi: 'Outcome indicator',
          initiative: 'Initiative',
          milestone: 'Milestone',
          task: 'Task',
        },
      },
    });
  });

  it('switches framework, adds and removes levels, and checks names', async () => {
    const { user, sent } = renderSetup('/setup');

    await user.click(
      await screen.findByRole('radio', { name: /Balanced Scorecard/ }),
    );
    expect(screen.getByRole('textbox', { name: 'Level 1 name' })).toHaveValue(
      'Perspective',
    );
    expect(
      screen.getByText(
        'Starts with Financial, Customer, Internal process, Learning and growth.',
      ),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Add a strategy level' }),
    );
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      screen.getByRole('textbox', { name: 'Level 3 name' }),
    ).toHaveAttribute('aria-invalid', 'true');
    expect(sent).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Remove level 3' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(sent[0]).toMatchObject({
        route: 'framework',
        body: { template: 'BALANCED_SCORECARD' },
      }),
    );
  });

  it('keeps level ids when renaming the plan’s own levels', async () => {
    const { user, sent } = renderSetup('/setup?step=2', { state: WITH_PLAN });

    await user.type(
      await screen.findByRole('textbox', { name: 'Level 1 name' }),
      's',
    );
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toMatchObject({
      levels: [
        { id: IDS.pillarLevel, label: 'Pillars', codePrefix: 'P' },
        { id: IDS.objectiveLevel, label: 'Objective' },
      ],
    });
  });

  it('saves the vision and adds pillars and objectives', async () => {
    const created: unknown[] = [];
    const { user, sent, container } = renderSetup('/setup?step=3', {
      state: WITH_PLAN,
      routes: {
        [`POST /api/v1/plans/${IDS.plan}/elements`]: (init) => {
          created.push(body(init));
          return json(201, {});
        },
      },
    });

    const tree = within(
      await screen.findByRole('region', { name: 'Your pillars' }),
    );
    expect(await tree.findByText('Revenue Diversification')).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);

    await user.type(
      tree.getByRole('textbox', { name: 'Add pillar' }),
      'People & Capabilities{Enter}',
    );
    await user.type(
      tree.getByRole('textbox', { name: 'Add objective to P1' }),
      'Grow fee income',
    );
    await user.click(tree.getByRole('button', { name: 'Add objective to P1' }));
    await waitFor(() => expect(created).toHaveLength(2));
    expect(created).toEqual([
      { title: 'People & Capabilities' },
      { title: 'Grow fee income', parentId: IDS.revenue },
    ]);
    // Adding a pillar never submits the step.
    expect(sent).toEqual([]);

    await user.type(
      screen.getByRole('textbox', { name: /Vision/ }),
      'The most trusted financial partner',
    );
    await user.type(
      screen.getByRole('textbox', { name: /Values/ }),
      'Integrity{Enter}Service',
    );
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      route: 'vision',
      body: {
        name: 'Strategic plan 2026–2028',
        startDate: '2026-01-01',
        endDate: '2028-12-31',
        vision: 'The most trusted financial partner',
        mission: null,
        values: ['Integrity', 'Service'],
        aspiration: null,
      },
    });
  });

  it('saves and signs out with "Save and finish later"', async () => {
    const { user, sent, calls } = renderSetup('/setup?step=1');

    await user.click(
      await screen.findByRole('button', { name: 'Save and finish later' }),
    );

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(sent.map((s) => s.route)).toEqual(['organisation']);
    expect(calls).toContain('POST /api/v1/auth/logout');
  });

  it('saves the starting rules', async () => {
    const { user, sent } = renderSetup('/setup?step=4', {
      state: { ...WITH_PLAN, step: 3 },
    });

    await user.click(await screen.findByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      route: 'governance',
      body: { config: { rag: { greenMaxPpBehind: 5 } } },
    });
  });

  it('invites people and finishes set-up', async () => {
    let finished = false;
    let invited: unknown;
    const { user } = renderSetup('/setup?step=5', {
      state: { ...WITH_PLAN, step: 4, missing: [] },
      routes: {
        'POST /api/v1/invitations': (init) => {
          invited = body(init);
          return json(201, {
            id: IDS.o11,
            email: 'tunde@meridian.example',
            roles: ['INITIATIVE_OWNER'],
            jobTitle: null,
            departmentId: null,
            status: 'PENDING',
            invitedBy: { id: IDS.o12, name: 'Amara Bello' },
            createdAt: '2026-10-20T09:00:00.000Z',
            expiresAt: '2026-10-27T09:00:00.000Z',
            acceptedAt: null,
            revokedAt: null,
            emailDelivered: true,
          });
        },
        'POST /api/v1/onboarding/complete': () => {
          finished = true;
          return json(200, {
            ...WITH_PLAN,
            status: 'ACTIVE',
            step: 5,
            missing: [],
            canComplete: false,
          });
        },
        // Once finished, the refreshed session says so.
        'POST /api/v1/auth/refresh': () =>
          json(200, finished ? SESSION : SETUP_SESSION),
      },
    });

    await user.type(
      await screen.findByRole('textbox', { name: /Work email/ }),
      'tunde@meridian.example',
    );
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));
    expect(
      await screen.findByText('Invitation sent to tunde@meridian.example.'),
    ).toBeVisible();
    expect(invited).toEqual({
      email: 'tunde@meridian.example',
      roles: ['INITIATIVE_OWNER'],
    });

    await user.click(screen.getByRole('button', { name: 'Finish set-up' }));

    await waitFor(() => expect(window.location.pathname).toBe('/strategy'));
    expect(finished).toBe(true);
  });
});
