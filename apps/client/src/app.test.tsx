import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './app';
import { safeRedirect } from './auth/use-auth';
import { setSession } from './lib/api/session-token';
import { axeViolations } from './test/axe';
import { fakeApi } from './test/fake-api';

beforeEach(() => {
  setSession(null);
  window.history.replaceState(null, '', '/');
});

describe('signing in', () => {
  it('shows an accessible sign-in page when there is no session', async () => {
    fakeApi();
    const { container } = render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(document.title).toBe('Sign in · SIMS');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('validates with the contract rules before calling the server', async () => {
    const { calls } = fakeApi();
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText('Enter a valid email address'),
    ).toBeVisible();
    expect(screen.getByLabelText(/Email/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(calls).not.toContain('POST /api/v1/auth/login');
  });

  it('explains a wrong password', async () => {
    fakeApi();
    render(<App />);
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText(/Email/),
      'amara.bello@meridian.example',
    );
    await user.type(screen.getByLabelText(/Password/), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email and password do not match',
    );
  });

  it('opens the app after signing in, and returns to sign-in after signing out', async () => {
    fakeApi();
    const { container } = render(<App />);
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText(/Email/),
      'amara.bello@meridian.example',
    );
    await user.type(screen.getByLabelText(/Password/), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(
      within(nav).getByRole('link', { name: 'Dashboard' }),
    ).toHaveAttribute('aria-current', 'page');
    // Two of the three updates need the user's attention.
    expect(await within(nav).findByText('2 due')).toBeVisible();
    expect(
      screen.getByRole('heading', {
        name: 'Strategy Execution Command Centre',
      }),
    ).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);

    await user.click(
      screen.getByRole('button', { name: 'Account: Amara Bello' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(
      await screen.findByRole('heading', { name: 'Sign in' }),
    ).toBeVisible();
  });
});

describe('restoring a session', () => {
  it('goes straight to the app when the refresh cookie is still valid', async () => {
    const { calls } = fakeApi({ signedIn: true });
    render(<App />);
    expect(
      await screen.findByRole('navigation', { name: 'Main' }),
    ).toBeInTheDocument();
    expect(calls[0]).toBe('POST /api/v1/auth/refresh');
  });

  it('remembers where the user was going', async () => {
    fakeApi();
    window.history.replaceState(null, '', '/initiatives');
    render(<App />);
    await screen.findByRole('heading', { name: 'Sign in' });
    await waitFor(() =>
      expect(window.location.search).toContain('redirect=%2Finitiatives'),
    );
  });
});

describe('safeRedirect', () => {
  it.each([
    ['/initiatives?tab=active', '/initiatives?tab=active'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['/login', '/'],
    [undefined, '/'],
  ])('%s → %s', (target, expected) => {
    expect(safeRedirect(target)).toBe(expected);
  });
});
