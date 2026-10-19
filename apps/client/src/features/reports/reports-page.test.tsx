import type { ReportPack } from '@sims/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import { fakeApi, json, SESSION } from '@/test/fake-api';
import {
  FAILED_PACK,
  PACKS,
  previewFor,
  Q2_PACK,
  SEPTEMBER,
  SNAPSHOTS,
} from './reports.fixture';

const saveFile = vi.hoisted(() => vi.fn());
vi.mock('@/lib/save-file', () => ({ saveFile }));

type Role = (typeof SESSION.session.membership.roles)[number];

function renderReports(
  options: { roles?: Role[]; snapshots?: typeof SNAPSHOTS } = {},
) {
  window.history.replaceState(null, '', '/reports');
  const sent: { route: string; body: unknown }[] = [];
  let packs: ReportPack[] = [...PACKS];
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
      'GET /api/v1/reports/snapshots': () =>
        json(200, options.snapshots ?? SNAPSHOTS),
      'POST /api/v1/reports/preview': (init) => {
        const body = JSON.parse(String(init.body));
        sent.push({ route: 'preview', body });
        return json(200, previewFor(body));
      },
      'GET /api/v1/reports/packs': () => json(200, packs),
      'POST /api/v1/reports/packs': (init) => {
        const body = JSON.parse(String(init.body));
        sent.push({ route: 'create', body });
        const created: ReportPack = {
          ...Q2_PACK,
          id: '0192a1b2-c3d4-7e5f-8a9b-000000000699',
          title: 'Q3 2026 Board pack',
          period: 'September 2026',
          status: 'QUEUED',
          version: '1.0',
          available: [],
          issuedAt: null,
        };
        packs = [created, ...packs];
        return json(201, created);
      },
      [`POST /api/v1/reports/packs/${FAILED_PACK.id}/regenerate`]: () => {
        sent.push({ route: 'regenerate', body: null });
        return json(200, { ...FAILED_PACK, status: 'QUEUED', error: null });
      },
      [`GET /api/v1/reports/packs/${Q2_PACK.id}/download`]: (_init, url) =>
        new Response(new Blob(['%PDF-1.7']), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Q2 2026 Board pack v1.1.${url.searchParams.get('format')!.toLowerCase()}"`,
          },
        }),
    },
  });
  return { ...api, sent, ...render(<App />), user: userEvent.setup() };
}

beforeEach(() => {
  setSession(null);
  saveFile.mockClear();
});

describe('Board pack builder', () => {
  it('starts from the latest locked cycle with the Board pack and a paged preview', async () => {
    const { sent, container } = renderReports();

    expect(
      await screen.findByRole('heading', { name: 'Board pack builder' }),
    ).toBeVisible();
    expect(
      await screen.findByRole('radio', { name: /Quarterly Board pack/ }),
    ).toBeChecked();
    expect(
      screen.getByRole('combobox', { name: 'Reporting snapshot' }),
    ).toHaveDisplayValue('Q3 2026 · locked 8 Oct');
    // Snapshots that cannot build packs are not offered.
    expect(
      screen.queryByRole('option', { name: /January 2026/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Audience' }),
    ).toHaveDisplayValue('Board of Directors');
    expect(
      await screen.findByText(
        'Sensitive initiatives (2) are summarised at pillar level for this audience.',
      ),
    ).toBeVisible();

    const exceptions = screen.getByRole('checkbox', {
      name: /Delayed & at-risk initiatives/,
    });
    expect(exceptions).toBeChecked();
    expect(exceptions.closest('label')).toHaveTextContent('2 pages');
    expect(
      screen.getByRole('checkbox', { name: /Full initiative register/ }),
    ).not.toBeChecked();

    // Cover, summary, pillars, matrix, two exception pages, decisions, benefits.
    expect(screen.getByText('Page 1 of 8')).toBeVisible();
    expect(sent[0]).toMatchObject({
      route: 'preview',
      body: {
        snapshotId: SEPTEMBER,
        template: 'QUARTERLY_BOARD',
        audience: 'BOARD',
        sections: expect.arrayContaining(['register', 'exceptions']),
      },
    });
    expect(await axeViolations(container)).toEqual([]);
  });

  it('pages through the preview, showing the narrative as it is typed', async () => {
    const { user } = renderReports();
    await screen.findByText('Page 1 of 8');
    await user.type(
      screen.getByRole('textbox', { name: /Executive narrative/ }),
      'Execution is broadly on plan.',
    );
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    const page = screen.getByRole('figure', {
      name: /page 2: Executive summary/,
    });
    expect(
      within(page).getByText('Execution is broadly on plan.'),
    ).toBeVisible();
    expect(screen.getByText('Page 2 of 8')).toBeVisible();
    for (let i = 0; i < 3; i++)
      await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(
      screen.getByRole('figure', {
        name: /Delayed & at-risk initiatives \(1 of 2\)/,
      }),
    ).toBeVisible();
  });

  it('updates the page count as sections are ticked', async () => {
    const { user } = renderReports();
    await screen.findByText('Page 1 of 8');
    await user.click(
      screen.getByRole('checkbox', { name: /Full initiative register/ }),
    );
    expect(screen.getByText('Page 1 of 10')).toBeVisible();
    await user.click(
      screen.getByRole('checkbox', { name: /Benefits realisation/ }),
    );
    expect(screen.getByText('Page 1 of 9')).toBeVisible();
  });

  it('switches template, audience and default sections together', async () => {
    const { user, sent } = renderReports();
    await screen.findByText('Page 1 of 8');
    await user.click(
      screen.getByRole('radio', { name: /Monthly management report/ }),
    );

    expect(
      screen.getByRole('combobox', { name: 'Audience' }),
    ).toHaveDisplayValue('Executive committee (EXCO)');
    expect(
      screen.getByRole('checkbox', { name: /Full initiative register/ }),
    ).toBeChecked();
    await waitFor(() =>
      expect(sent.at(-1)).toMatchObject({
        route: 'preview',
        body: { template: 'MONTHLY_MANAGEMENT', audience: 'EXCO' },
      }),
    );
    expect(
      await screen.findByRole('checkbox', {
        name: 'Decisions required, 1 page',
      }),
    ).toBeVisible();
  });

  it('generates the pack in the chosen formats', async () => {
    const { user, sent } = renderReports();
    await screen.findByText('Page 1 of 8');
    await user.type(
      screen.getByRole('textbox', { name: /Executive narrative/ }),
      'Digital delivery is slipping.',
    );
    await user.click(
      screen.getByRole('button', { name: 'Excel data appendix' }),
    );
    await user.click(screen.getByRole('button', { name: 'PowerPoint' }));
    expect(screen.getByRole('button', { name: 'PowerPoint' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await user.click(screen.getByRole('button', { name: 'Generate pack' }));

    expect(
      await screen.findByText(
        'Q3 2026 Board pack is being generated. It appears below when ready.',
      ),
    ).toBeVisible();
    expect(sent.find((s) => s.route === 'create')).toEqual({
      route: 'create',
      body: {
        snapshotId: SEPTEMBER,
        template: 'QUARTERLY_BOARD',
        audience: 'BOARD',
        sections: [
          'executive_summary',
          'pillar_performance',
          'delivery_vs_value',
          'exceptions',
          'decisions',
          'benefits',
        ],
        scopeElementId: null,
        narrative: 'Digital delivery is slipping.',
        formats: ['PDF', 'XLSX'],
      },
    });
    const issued = screen.getByRole('region', { name: 'Issued packs' });
    expect(await within(issued).findByText('Queued')).toBeVisible();
  });
});

describe('Issued packs', () => {
  it('downloads a pack and retries a failed one', async () => {
    const { user, sent } = renderReports();
    const issued = await screen.findByRole('region', { name: 'Issued packs' });
    expect(
      await within(issued).findByText('Issued 22 Jul · PDF, PPTX · v1.1'),
    ).toBeVisible();

    await user.click(
      within(issued).getByRole('button', {
        name: 'Download Q2 2026 Board pack as PDF',
      }),
    );
    await waitFor(() => expect(saveFile).toHaveBeenCalled());
    expect(saveFile.mock.calls[0]![1]).toBe('Q2 2026 Board pack v1.1.pdf');

    expect(within(issued).getByText('Failed')).toBeVisible();
    expect(
      within(issued).getByText(
        'PDF packs need Chrome or Chromium on the server.',
      ),
    ).toBeVisible();
    await user.click(
      within(issued).getByRole('button', {
        name: 'Generate August management report again',
      }),
    );
    await waitFor(() =>
      expect(sent.map((s) => s.route)).toContain('regenerate'),
    );
  });

  it('shows Board members the issued packs only', async () => {
    renderReports({ roles: ['BOARD'] });
    expect(
      await screen.findByRole('heading', { name: 'Reports' }),
    ).toBeVisible();
    expect(
      await screen.findByRole('region', { name: 'Issued packs' }),
    ).toBeVisible();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Generate .* again/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reports' })).toBeVisible();
  });

  it('keeps Reports out of the menu for people without a reporting role', async () => {
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
      screen.queryByRole('link', { name: 'Reports' }),
    ).not.toBeInTheDocument();
  });

  it('explains when no cycle has been locked yet', async () => {
    renderReports({ snapshots: [SNAPSHOTS[2]!] });
    expect(await screen.findByText('No locked cycle yet')).toBeVisible();
  });
});
