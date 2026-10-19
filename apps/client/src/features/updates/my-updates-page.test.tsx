import {
  myUpdatesSchema,
  type UpdateForm,
  updateFormSchema,
} from '@sims/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import { fakeApi, json } from '@/test/fake-api';
import {
  DIG_004,
  FORM,
  MY_UPDATES,
  PERIOD_ID,
  REV_005,
} from './updates.fixture';

type Sent = { route: string; body: Record<string, unknown> };

function renderUpdates(
  options: { form?: UpdateForm; path?: string; noPeriod?: boolean } = {},
) {
  window.history.replaceState(null, '', options.path ?? '/my-updates');
  const sent: Sent[] = [];
  const respond = (status: 'DRAFT' | 'SUBMITTED') => (init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    sent.push({ route: status, body });
    return json(200, {
      ...(options.form ?? FORM),
      update: {
        ...(options.form ?? FORM).update!,
        status,
        submittedAt: status === 'SUBMITTED' ? '2026-10-16T10:00:00.000Z' : null,
      },
      can: { ...FORM.can, edit: status === 'DRAFT' },
    } satisfies UpdateForm);
  };
  const base = `/api/v1/periods/${PERIOD_ID}/updates`;
  const api = fakeApi({
    signedIn: true,
    routes: {
      'GET /api/v1/my-updates': () =>
        json(200, options.noPeriod ? { period: null, items: [] } : MY_UPDATES),
      [`GET ${base}/${DIG_004}`]: () => json(200, options.form ?? FORM),
      [`GET ${base}/${REV_005}`]: () =>
        json(200, {
          ...FORM,
          initiative: {
            ...FORM.initiative,
            id: REV_005,
            code: 'REV-005',
            title: 'Bancassurance Product Bundle',
          },
          update: null,
        }),
      [`PUT ${base}/${DIG_004}`]: respond('DRAFT'),
      [`POST ${base}/${DIG_004}/submit`]: respond('SUBMITTED'),
      'POST /api/v1/risks': (init) => {
        sent.push({
          route: 'risk',
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
        });
        return json(201, {});
      },
    },
  });
  return { ...api, sent, ...render(<App />), user: userEvent.setup() };
}

const claim = (title: string) =>
  screen.getByRole('spinbutton', { name: `Completion this month, ${title}` });

beforeEach(() => setSession(null));

describe('Monthly progress update', () => {
  it('uses fixtures that satisfy the contract', () => {
    expect(myUpdatesSchema.safeParse(MY_UPDATES).success).toBe(true);
    expect(updateFormSchema.safeParse(FORM).success).toBe(true);
  });

  it('opens the first update that needs action, accessibly', async () => {
    const { container } = renderUpdates();
    expect(
      await screen.findByRole('heading', { name: 'Monthly progress update' }),
    ).toBeVisible();
    expect(
      screen.getByText(/October 2026 cycle · due Sat 17 Oct, 5:00 pm/),
    ).toBeVisible();
    const cards = screen.getByRole('navigation', {
      name: 'Your updates this cycle',
    });
    expect(
      within(cards).getByRole('button', { name: /DIG-004/ }),
    ).toHaveAttribute('aria-current', 'true');
    expect(within(cards).getByText('None yet')).toBeVisible();

    await screen.findByRole('region', {
      name: 'DIG-004 · Launch Digital Investment Platform',
    });
    // The completed milestone is locked; the others take this month's claim.
    expect(screen.getByText('Verified · locked')).toBeVisible();
    expect(screen.getByText('1 file uploaded')).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('recalculates completion and the checklist as the owner types', async () => {
    const { user } = renderUpdates();
    await screen.findByRole('region', { name: /DIG-004/ });
    const checklist = screen.getByRole('region', { name: 'Before you submit' });
    expect(
      within(checklist).getByText(
        /Enter completion for: Technology development, Testing and deployment, Commercial launch/,
      ),
    ).toBeVisible();

    await user.type(claim('Technology development'), '85');
    await user.type(claim('Testing and deployment'), '44');
    await user.type(claim('Commercial launch'), '0');

    // 20×100 + 40×85 + 25×44 + 15×0 = 6,500 ÷ 100 = 65%; planned 74% → −9 pp.
    expect(screen.getByText('65%')).toBeVisible();
    expect(screen.getByText('-9 pp')).toBeVisible();
    expect(
      within(checklist).getByText('All milestones have a completion value'),
    ).toBeVisible();
    // 44% is above last month's 30% with no file yet.
    expect(screen.getByText('Upload required')).toBeVisible();
    // More than 5 pp behind: explanation and recovery become required.
    expect(
      screen.getByText(
        /so a variance explanation and recovery action are required/,
      ),
    ).toBeVisible();
    expect(within(checklist).getByText(/explain why/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Submit for review' }),
    ).toBeDisabled();
  });

  it('saves a draft and submits once the checklist is complete', async () => {
    const { user, sent } = renderUpdates();
    await screen.findByRole('region', { name: /DIG-004/ });
    await user.type(claim('Technology development'), '85');
    await user.type(claim('Testing and deployment'), '44');
    await user.type(claim('Commercial launch'), '0');
    await user.type(
      screen.getByLabelText(/Progress this period/),
      'Integration testing started with the vendor.',
    );

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(sent.at(-1)?.route).toBe('DRAFT'));
    expect(sent.at(-1)?.body).toEqual({
      // The locked milestone is not sent.
      lines: [
        { milestoneId: FORM.lines[1]!.milestoneId, claimedCompletion: 85 },
        { milestoneId: FORM.lines[2]!.milestoneId, claimedCompletion: 44 },
        { milestoneId: FORM.lines[3]!.milestoneId, claimedCompletion: 0 },
      ],
      progressNarrative: 'Integration testing started with the vendor.',
      varianceExplanation: null,
      recoveryAction: null,
      nextSteps: null,
      needsDecision: false,
    });

    await user.type(
      screen.getByLabelText(/Variance explanation/),
      'Vendor contract signature slipped two weeks.',
    );
    await user.type(
      screen.getByLabelText(/Recovery action/),
      'Parallel testing from 25 Oct to recover.',
    );
    await user.click(screen.getByLabelText(/I need a management decision/));
    const submit = screen.getByRole('button', { name: 'Submit for review' });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(
      await screen.findByText(/Submitted — waiting for the Strategy Office/),
    ).toBeVisible();
    expect(sent.at(-1)).toMatchObject({
      route: 'SUBMITTED',
      body: {
        varianceExplanation: 'Vendor contract signature slipped two weeks.',
        recoveryAction: 'Parallel testing from 25 Oct to recover.',
        needsDecision: true,
      },
    });
    // Submitted updates are read-only.
    expect(claim('Testing and deployment')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Submit for review' }),
    ).not.toBeInTheDocument();
  });

  it('shows why an update was challenged and lets the owner change it', async () => {
    renderUpdates({
      form: {
        ...FORM,
        update: { ...FORM.update!, status: 'CHALLENGED' },
        comments: [
          {
            id: '0192a1b2-c3d4-7e5f-8a9b-000000000801',
            parentId: null,
            kind: 'CHALLENGE',
            body: 'Testing at 44% is not supported by the test report.',
            author: {
              membershipId: '0192a1b2-c3d4-7e5f-8a9b-000000000802',
              name: 'Amara Bello',
              jobTitle: 'Head, Strategy Office',
            },
            at: '2026-10-15T09:00:00.000Z',
          },
        ],
      },
    });
    expect(
      await screen.findByText('The Strategy Office challenged this update'),
    ).toBeVisible();
    expect(
      screen.getAllByText(/not supported by the test report/).length,
    ).toBeGreaterThan(0);
    expect(claim('Testing and deployment')).toBeEnabled();
  });

  it('switches between updates, keeping the choice in the URL', async () => {
    const { user } = renderUpdates();
    const cards = await screen.findByRole('navigation', {
      name: 'Your updates this cycle',
    });
    await user.click(within(cards).getByRole('button', { name: /REV-005/ }));
    expect(
      await screen.findByRole('region', {
        name: /REV-005 · Bancassurance Product Bundle/,
      }),
    ).toBeVisible();
    expect(window.location.search).toBe(`?initiative=${REV_005}`);
  });

  it('logs a risk from the update', async () => {
    const { user, sent } = renderUpdates();
    await screen.findByRole('region', { name: /DIG-004/ });
    await user.click(screen.getByRole('button', { name: 'Add risk or issue' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Add a risk or issue to DIG-004',
    });
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'ISSUE');
    await user.type(
      within(dialog).getByLabelText(/^Title/),
      'Test environment unavailable',
    );
    await user.selectOptions(within(dialog).getByLabelText(/Severity/), 'HIGH');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(sent.at(-1)).toMatchObject({
        route: 'risk',
        body: {
          initiativeId: DIG_004,
          type: 'ISSUE',
          title: 'Test environment unavailable',
          severity: 'HIGH',
          likelihood: null,
          impact: null,
        },
      }),
    );
  });

  it('explains when no cycle is open', async () => {
    renderUpdates({ noPeriod: true });
    expect(await screen.findByText('No reporting cycle is open')).toBeVisible();
  });
});
