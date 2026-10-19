import type { InitiativeDetail, MemberPage } from '@sims/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import { fakeApi, json, problem } from '@/test/fake-api';
import { IDS, MAP } from '../strategy/strategy.fixture';
import { page } from './register.fixture';

const id = (n: number) =>
  `0192a1b2-c3d4-7e5f-8a9b-${String(n).padStart(12, '0')}`;

const PEOPLE: MemberPage = {
  items: [
    {
      membershipId: id(501),
      name: 'Tunde Bakare',
      email: 'tunde.bakare@meridian.example',
      jobTitle: 'ED, Business',
      department: { id: id(601), name: 'Business Development' },
      roles: ['EXECUTIVE_SPONSOR'],
    },
    {
      membershipId: id(502),
      name: 'Ngozi Eze',
      email: 'ngozi.eze@meridian.example',
      jobTitle: 'ED, Technology',
      department: null,
      roles: ['EXECUTIVE_SPONSOR'],
    },
  ],
  page: 1,
  pageSize: 8,
  total: 2,
};

function renderPropose(
  respond: (body: Record<string, unknown>) => Response = (body) =>
    json(201, {
      id: id(900),
      code: 'REV-009',
      title: body.title,
      status: body.status,
    } as unknown as InitiativeDetail),
) {
  window.history.replaceState(null, '', '/initiatives/new');
  const sent: Record<string, unknown>[] = [];
  const memberQueries: URLSearchParams[] = [];
  const api = fakeApi({
    signedIn: true,
    routes: {
      'GET /api/v1/plans/current/map': () => json(200, MAP),
      'GET /api/v1/departments': () =>
        json(200, [
          {
            id: id(601),
            name: 'Business Development',
            code: null,
            parentId: null,
            memberCount: 4,
          },
        ]),
      'GET /api/v1/members': (_init, url) => {
        memberQueries.push(url.searchParams);
        const q = url.searchParams.get('q')?.toLowerCase();
        return json(200, {
          ...PEOPLE,
          items: PEOPLE.items.filter(
            (p) => !q || p.name.toLowerCase().includes(q),
          ),
        });
      },
      'POST /api/v1/initiatives': (init) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        sent.push(body);
        return respond(body);
      },
      'GET /api/v1/initiatives': () => json(200, page()),
    },
  });
  return {
    ...api,
    sent,
    memberQueries,
    ...render(<App />),
    user: userEvent.setup(),
  };
}

beforeEach(() => setSession(null));

describe('Propose initiative', () => {
  it('lays out the four sections accessibly', async () => {
    const { container } = renderPropose();
    expect(
      await screen.findByRole('heading', { name: 'Propose initiative' }),
    ).toBeVisible();
    for (const name of [
      '1 · Details',
      '2 · Strategic fit',
      '3 · People',
      '4 · Baseline and budget',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeVisible();
    }
    // Objectives are grouped under their pillar.
    const objective = screen.getByRole('combobox', { name: /Objective 1/ });
    expect(
      within(objective).getByRole('group', { name: 'Revenue Diversification' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Budget (NGN)')).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('checks the essentials before sending anything', async () => {
    const { user, sent } = renderPropose();
    await user.click(
      await screen.findByRole('button', { name: 'Submit proposal' }),
    );

    expect(await screen.findByText('Required')).toBeVisible();
    expect(screen.getByLabelText(/^Title/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByText('Choose an item from the list')).toBeVisible();
    expect(sent).toEqual([]);
  });

  it('submits a proposal and returns to the pipeline with a confirmation', async () => {
    const { user, sent, memberQueries } = renderPropose();

    await user.type(
      await screen.findByLabelText(/^Title/),
      'Wealth advisory app',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Objective 1/ }),
      IDS.o11,
    );
    await user.type(
      screen.getByLabelText(/Business case/),
      'Fee income growth',
    );

    // Pick the sponsor with the people picker: type, then choose.
    const sponsor = screen.getByRole('combobox', { name: 'Executive sponsor' });
    await user.type(sponsor, 'tun');
    await user.click(
      await screen.findByRole('option', { name: /Tunde Bakare/ }),
    );
    expect(sponsor).toHaveValue('Tunde Bakare');
    expect(
      screen.getByText('ED, Business · Business Development'),
    ).toBeVisible();
    // The sponsor picker only offers executive sponsors.
    expect(
      memberQueries.some((q) => q.get('role') === 'EXECUTIVE_SPONSOR'),
    ).toBe(true);

    await user.type(screen.getByLabelText('Start'), '2026-11-01');
    await user.type(screen.getByLabelText('End'), '2027-06-30');
    await user.type(screen.getByLabelText('Budget (NGN)'), '50000000');
    await user.click(screen.getByRole('button', { name: 'Submit proposal' }));

    expect(
      await screen.findByText(
        'REV-009 · Wealth advisory app was submitted to the Strategy Office for approval.',
      ),
    ).toBeVisible();
    expect(window.location.search).toBe('?tab=pipeline');
    expect(sent).toEqual([
      expect.objectContaining({
        title: 'Wealth advisory app',
        businessCase: 'Fee income growth',
        objectives: [{ elementId: IDS.o11, weight: 100, isPrimary: true }],
        sponsorId: id(501),
        ownerId: null,
        baselineStart: '2026-11-01',
        baselineEnd: '2027-06-30',
        baselineBudget: 50_000_000,
        status: 'PROPOSED',
        priority: 2,
        isSensitive: false,
      }),
    ]);
    // Blank optional fields are not sent as empty strings.
    expect(sent[0]).not.toHaveProperty('code');

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() =>
      expect(screen.queryByText(/was submitted/)).not.toBeInTheDocument(),
    );
  });

  it('can add objectives, moving "primary" between them', async () => {
    const { user, sent } = renderPropose();
    await user.type(await screen.findByLabelText(/^Title/), 'Shared platform');
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Objective 1/ }),
      IDS.o11,
    );
    await user.click(
      screen.getByRole('button', { name: 'Add another objective' }),
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Objective 2/ }),
      IDS.o21,
    );
    await user.click(screen.getAllByRole('radio', { name: 'Primary' })[1]!);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await screen.findByText(/was saved as a draft/);
    expect(sent[0]).toMatchObject({
      status: 'DRAFT',
      objectives: [
        { elementId: IDS.o11, weight: 100, isPrimary: false },
        { elementId: IDS.o21, weight: 50, isPrimary: true },
      ],
    });
  });

  it('shows a taken code next to the code field', async () => {
    const { user } = renderPropose(() =>
      problem(
        409,
        'CODE_TAKEN',
        'DIG-001 is already used by another initiative.',
      ),
    );
    await user.type(await screen.findByLabelText(/^Title/), 'Duplicate');
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Objective 1/ }),
      IDS.o11,
    );
    await user.type(screen.getByLabelText(/^Code/), 'DIG-001');
    await user.click(screen.getByRole('button', { name: 'Submit proposal' }));
    expect(
      await screen.findByText('DIG-001 is already used by another initiative.'),
    ).toBeVisible();
    expect(screen.getByLabelText(/^Code/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
});
