import type {
  PeriodSummary,
  UpdateForm,
  UpdateListItem,
} from '@sims/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import { fakeApi, json, SESSION } from '@/test/fake-api';
import { DIG_004, FORM, PERIOD_ID, REV_005 } from './updates.fixture';

const PERIOD: PeriodSummary = {
  id: PERIOD_ID,
  name: 'October 2026',
  status: 'STRATEGY_REVIEW',
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  deadlines: {
    submissionOpensAt: null,
    submissionDueAt: '2026-10-10T16:00:00.000Z',
    strategyReviewDueAt: '2026-10-14T16:00:00.000Z',
    sponsorReviewDueAt: null,
    reportIssueDueAt: null,
  },
  lockedAt: null,
  cycleDay: { day: 4, of: 8 },
  counts: {
    owed: 2,
    in: 2,
    outstanding: 0,
    drafts: 0,
    awaitingVerification: 1,
    challenged: 0,
    awaitingSponsor: 1,
    approved: 0,
  },
};

const listItem = (
  initiativeId: string,
  code: string,
  title: string,
  status: UpdateListItem['status'],
): UpdateListItem => ({
  updateId: `${initiativeId.slice(0, -3)}999`,
  initiativeId,
  code,
  title,
  owner: {
    membershipId: '0192a1b2-c3d4-7e5f-8a9b-000000000901',
    name: 'Hassan Danjuma',
    jobTitle: 'Head, Digital Business',
  },
  status,
  claimedProgress: 65,
  verifiedProgress: status === 'REVIEWED' ? 60 : null,
  plannedProgress: 74,
  submittedAt: '2026-10-09T15:00:00.000Z',
  evidenceFlags: status === 'SUBMITTED' ? 1 : 0,
});

const QUEUE = [
  listItem(
    DIG_004,
    'DIG-004',
    'Launch Digital Investment Platform',
    'SUBMITTED',
  ),
  {
    ...listItem(REV_005, 'REV-005', 'Bancassurance Product Bundle', 'REVIEWED'),
    updateId: '0192a1b2-c3d4-7e5f-8a9b-000000000998',
  },
];

/** DIG-004 as submitted: claims 85 / 44 / 0, waiting for the Strategy Office. */
const SUBMITTED: UpdateForm = {
  ...FORM,
  update: {
    ...FORM.update!,
    status: 'SUBMITTED',
    claimedProgress: 65,
    submittedAt: '2026-10-09T15:00:00.000Z',
    progressNarrative: 'Integration testing started.',
  },
  lines: FORM.lines.map((l, i) =>
    l.locked ? l : { ...l, claimed: [85, 44, 0][i - 1]! },
  ),
  can: {
    edit: false,
    submit: false,
    verify: true,
    challenge: true,
    approve: false,
    comment: true,
  },
};

type Role = (typeof SESSION.session.membership.roles)[number];

function renderReviews(
  options: { roles?: Role[]; form?: UpdateForm; path?: string } = {},
) {
  window.history.replaceState(null, '', options.path ?? '/reviews');
  const sent: { route: string; body: unknown }[] = [];
  const base = `/api/v1/periods/${PERIOD_ID}/updates/${DIG_004}`;
  const record =
    (route: string, status: NonNullable<UpdateForm['update']>['status']) =>
    (init: RequestInit) => {
      sent.push({ route, body: JSON.parse(String(init.body)) });
      const form = options.form ?? SUBMITTED;
      return json(200, {
        ...form,
        update: { ...form.update!, status },
        can: { ...form.can, verify: false, challenge: false, approve: false },
      } satisfies UpdateForm);
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
      'GET /api/v1/periods/current': () => json(200, PERIOD),
      [`GET /api/v1/periods/${PERIOD_ID}/updates`]: () => json(200, QUEUE),
      [`GET ${base}`]: () => json(200, options.form ?? SUBMITTED),
      [`POST ${base}/verify`]: record('verify', 'REVIEWED'),
      [`POST ${base}/challenge`]: record('challenge', 'CHALLENGED'),
      [`POST ${base}/approve`]: record('approve', 'APPROVED'),
      [`POST ${base}/comments`]: (init) => {
        sent.push({ route: 'comment', body: JSON.parse(String(init.body)) });
        return json(201, {
          ...(options.form ?? SUBMITTED),
          comments: [
            {
              id: '0192a1b2-c3d4-7e5f-8a9b-000000000990',
              parentId: null,
              kind: 'COMMENT',
              body: 'Please attach the test report.',
              author: {
                membershipId: SESSION.session.membership.id,
                name: 'Amara Bello',
                jobTitle: 'Head, Strategy Office',
              },
              at: '2026-10-12T09:00:00.000Z',
            },
          ],
        } satisfies UpdateForm);
      },
    },
  });
  return { ...api, sent, ...render(<App />), user: userEvent.setup() };
}

beforeEach(() => setSession(null));

describe('Update reviews', () => {
  it('shows the Strategy Office what is waiting to be verified', async () => {
    const { container } = renderReviews();
    expect(
      await screen.findByRole('heading', { name: 'Update reviews' }),
    ).toBeVisible();
    expect(
      await screen.findByRole('button', { name: 'To verify · 1' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Waiting for sponsor · 1' }),
    ).toBeVisible();
    const table = screen.getByRole('table');
    expect(
      within(table).getByText('Launch Digital Investment Platform'),
    ).toBeVisible();
    expect(
      within(table).queryByText('Bancassurance Product Bundle'),
    ).not.toBeInTheDocument();
    expect(within(table).getByText('1 missing')).toBeVisible();
    // Reviewing is in the sidebar for reviewers.
    expect(screen.getByRole('link', { name: 'Reviews' })).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('verifies the figures, adjusting a claim the evidence does not support', async () => {
    const { user, sent, container } = renderReviews();
    await user.click(
      await screen.findByRole('button', { name: 'Review DIG-004' }),
    );
    expect(window.location.search).toContain(`initiative=${DIG_004}`);

    const review = await screen.findByRole('region', {
      name: /Review of DIG-004/,
    });
    expect(
      within(review).getByText('Integration testing started.'),
    ).toBeVisible();
    const testing = await within(review).findByRole('spinbutton', {
      name: 'Verified completion, Testing and deployment',
    });
    expect(testing).toHaveValue(44);
    await user.clear(testing);
    await user.type(testing, '30');
    // 20×100 + 40×85 + 25×30 + 15×0 = 6,150 ÷ 100
    expect(within(review).getByText('62%')).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);

    await user.type(
      within(review).getByLabelText(/Note/),
      'Testing capped at last month: no report yet.',
    );
    await user.click(within(review).getByRole('button', { name: 'Verify' }));
    await waitFor(() =>
      expect(sent).toEqual([
        {
          route: 'verify',
          body: {
            lines: [
              {
                milestoneId: FORM.lines[1]!.milestoneId,
                verifiedCompletion: 85,
              },
              {
                milestoneId: FORM.lines[2]!.milestoneId,
                verifiedCompletion: 30,
              },
              {
                milestoneId: FORM.lines[3]!.milestoneId,
                verifiedCompletion: 0,
              },
            ],
            comment: 'Testing capped at last month: no report yet.',
          },
        },
      ]),
    );
    expect(
      await within(review).findByText(/Verified — waiting for the sponsor/),
    ).toBeVisible();
    expect(
      within(review).queryByRole('button', { name: 'Verify' }),
    ).not.toBeInTheDocument();
  });

  it('challenges an update, saying what must change', async () => {
    const { user, sent } = renderReviews({
      path: `/reviews?initiative=${DIG_004}`,
    });
    const review = await screen.findByRole('region', {
      name: /Review of DIG-004/,
    });
    await user.click(
      await within(review).findByRole('button', { name: 'Challenge' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Challenge DIG-004',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Send back to owner' }),
    );
    expect(within(dialog).getByText(/10\+ characters/)).toBeVisible();
    await user.type(
      within(dialog).getByLabelText(/What needs to change/),
      'Attach the test report for 44%.',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Send back to owner' }),
    );
    await waitFor(() =>
      expect(sent).toEqual([
        {
          route: 'challenge',
          body: { comment: 'Attach the test report for 44%.' },
        },
      ]),
    );
  });

  it('lets the sponsor confirm a verified update', async () => {
    const { user } = renderReviews({
      roles: ['EXECUTIVE_SPONSOR'],
      form: {
        ...SUBMITTED,
        update: {
          ...SUBMITTED.update!,
          status: 'REVIEWED',
          verifiedProgress: 61.5,
        },
        can: {
          edit: false,
          submit: false,
          verify: false,
          challenge: true,
          approve: true,
          comment: true,
        },
      },
    });
    // Sponsors land on what waits for them.
    expect(
      await screen.findByRole('button', { name: 'Waiting for you · 1' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Review REV-005' }));
  });

  it('confirms and approves from the review panel', async () => {
    const { user, sent } = renderReviews({
      roles: ['EXECUTIVE_SPONSOR'],
      path: `/reviews?initiative=${DIG_004}`,
      form: {
        ...SUBMITTED,
        update: {
          ...SUBMITTED.update!,
          status: 'REVIEWED',
          verifiedProgress: 61.5,
        },
        can: {
          edit: false,
          submit: false,
          verify: false,
          challenge: true,
          approve: true,
          comment: true,
        },
      },
    });
    const review = await screen.findByRole('region', {
      name: /Review of DIG-004/,
    });
    expect(await within(review).findByText('62%')).toBeVisible();
    expect(within(review).queryByRole('spinbutton')).not.toBeInTheDocument();
    await user.click(
      within(review).getByRole('button', { name: 'Confirm and approve' }),
    );
    await waitFor(() => expect(sent).toEqual([{ route: 'approve', body: {} }]));
    expect(
      await within(review).findByText(/Approved — locked into the report/),
    ).toBeVisible();
  });

  it('adds a comment to the conversation', async () => {
    const { user, sent } = renderReviews({
      path: `/reviews?initiative=${DIG_004}`,
    });
    const review = await screen.findByRole('region', {
      name: /Review of DIG-004/,
    });
    const conversation = await within(review).findByRole('region', {
      name: 'Conversation',
    });
    await user.type(
      within(conversation).getByLabelText('Add a comment'),
      'Please attach the test report.',
    );
    await user.click(
      within(conversation).getByRole('button', { name: 'Comment' }),
    );
    await waitFor(() =>
      expect(sent).toEqual([
        { route: 'comment', body: { body: 'Please attach the test report.' } },
      ]),
    );
    expect(
      await within(conversation).findByText('Please attach the test report.'),
    ).toBeVisible();
  });

  it('keeps Reviews out of the menu for people who do not review', async () => {
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
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: /My updates/ })).toBeVisible();
    expect(
      within(nav).queryByRole('link', { name: 'Reviews' }),
    ).not.toBeInTheDocument();
  });
});
