import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import { fakeApi, json, problem, SESSION } from '@/test/fake-api';

beforeEach(() => {
  setSession(null);
  window.history.replaceState(null, '', '/signup');
});

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    await screen.findByRole('textbox', { name: /Organisation name/ }),
    'Northwind Advisory',
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: /Sector/ }),
    'Non-profit or development organisation',
  );
  await user.type(screen.getByRole('textbox', { name: /Country/ }), 'ke');
  await user.selectOptions(
    screen.getByRole('combobox', { name: /Currency/ }),
    'KES',
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: /Time zone/ }),
    'Africa/Nairobi',
  );
  await user.type(
    screen.getByRole('textbox', { name: /Your name/ }),
    'Wanjiru Kamau',
  );
  await user.type(
    screen.getByRole('textbox', { name: /Work email/ }),
    'Wanjiru@Northwind.example',
  );
  await user.type(
    screen.getByLabelText(/^Password/),
    'a long enough passphrase',
  );
}

describe('signing up', () => {
  it('is reachable from sign-in and accessible', async () => {
    window.history.replaceState(null, '', '/login');
    fakeApi();
    const { container } = render(<App />);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('link', {
        name: 'Set up a workspace for your organisation',
      }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Set up your workspace' }),
    ).toBeVisible();
    expect(window.location.pathname).toBe('/signup');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('checks the fields with the contract rules before calling the server', async () => {
    const { calls } = fakeApi();
    render(<App />);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Password/), 'too short');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(await screen.findByText('Use at least 12 characters')).toBeVisible();
    expect(
      screen.getByText('Use a two-letter country code, e.g. NG'),
    ).toBeVisible();
    expect(calls).not.toContain('POST /api/v1/auth/signup');
  });

  it('creates the workspace and signs the founder in', async () => {
    let sent: Record<string, unknown> | undefined;
    fakeApi({
      routes: {
        'POST /api/v1/auth/signup': (init) => {
          sent = JSON.parse(String(init.body));
          return json(201, SESSION);
        },
      },
    });
    render(<App />);
    const user = userEvent.setup();

    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(sent).toEqual({
      organisationName: 'Northwind Advisory',
      sector: 'NON_PROFIT',
      country: 'KE',
      currency: 'KES',
      timezone: 'Africa/Nairobi',
      name: 'Wanjiru Kamau',
      email: 'wanjiru@northwind.example',
      password: 'a long enough passphrase',
    });
  });

  it('points to sign-in when the email already has an account', async () => {
    fakeApi({
      routes: {
        'POST /api/v1/auth/signup': () =>
          problem(409, 'EMAIL_TAKEN', 'An account already uses this email.'),
      },
    });
    render(<App />);
    const user = userEvent.setup();

    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(
      await screen.findByText('An account already uses this email address.'),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: /Work email/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('link', { name: 'Sign in instead' })).toBeVisible();
  });

  it('shows a taken workspace address on its field', async () => {
    fakeApi({
      routes: {
        'POST /api/v1/auth/signup': () =>
          problem(409, 'SLUG_TAKEN', 'That address is taken.'),
      },
    });
    render(<App />);
    const user = userEvent.setup();

    await fillIn(user);
    await user.type(
      screen.getByRole('textbox', { name: /Workspace address/ }),
      'northwind',
    );
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(
      await screen.findByText(
        'Another organisation uses this address. Try another.',
      ),
    ).toBeVisible();
  });
});
