import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import { type FakeRoute, fakeApi, json, problem } from '@/test/fake-api';

const TOKEN = 'reset-token-0123456789abcdefghij';

function open(path: string, routes: Record<string, FakeRoute> = {}) {
  setSession(null);
  window.history.replaceState(null, '', path);
  const api = fakeApi({ routes });
  return { ...api, ...render(<App />), user: userEvent.setup() };
}

describe('forgot password', () => {
  it('is linked from sign-in, carrying the email typed there', async () => {
    const { user, container } = open('/login');

    await user.type(
      await screen.findByLabelText(/Email/),
      'amara.bello@meridian.example',
    );
    await user.click(
      screen.getByRole('link', { name: 'Forgot your password?' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Forgot your password?' }),
    ).toBeVisible();
    expect(screen.getByLabelText(/Email/)).toHaveValue(
      'amara.bello@meridian.example',
    );
    expect(await axeViolations(container)).toEqual([]);
  });

  it('says the same thing whether or not the account exists', async () => {
    let sent: unknown;
    const { user } = open('/forgot-password', {
      'POST /api/v1/auth/password-reset/request': (init) => {
        sent = JSON.parse(String(init.body));
        return json(204);
      },
    });

    await user.type(
      await screen.findByLabelText(/Email/),
      'Someone@Example.com',
    );
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(
      await screen.findByRole('heading', { name: 'Check your email' }),
    ).toBeVisible();
    expect(screen.getByText(/If an account uses/)).toHaveTextContent(
      'If an account uses someone@example.com, we have sent it a link',
    );
    expect(sent).toEqual({ email: 'someone@example.com' });
  });

  it('checks the email before sending', async () => {
    const { user, calls } = open('/forgot-password');

    await user.click(
      await screen.findByRole('button', { name: 'Send reset link' }),
    );

    expect(
      await screen.findByText('Enter a valid email address'),
    ).toBeVisible();
    expect(calls).not.toContain('POST /api/v1/auth/password-reset/request');
  });
});

describe('choosing a new password', () => {
  it('sets the new password and returns to sign-in', async () => {
    let completed: unknown;
    const { user, container } = open(`/reset-password?token=${TOKEN}`, {
      'POST /api/v1/auth/password-reset/check': () =>
        json(200, {
          email: 'amara.bello@meridian.example',
          expiresAt: '2026-10-22T15:00:00.000Z',
        }),
      'POST /api/v1/auth/password-reset/complete': (init) => {
        completed = JSON.parse(String(init.body));
        return json(204);
      },
    });

    expect(
      await screen.findByRole('heading', { name: 'Choose a new password' }),
    ).toBeVisible();
    expect(screen.getByText(/For amara.bello@meridian.example/)).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);

    await user.type(screen.getByLabelText(/New password/), 'short');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByText('Use at least 12 characters')).toBeVisible();

    await user.type(screen.getByLabelText(/New password/), ' and longer now');
    await user.type(screen.getByLabelText(/Type it again/), 'different');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByText('The two passwords do not match')).toBeVisible();

    await user.clear(screen.getByLabelText(/Type it again/));
    await user.type(
      screen.getByLabelText(/Type it again/),
      'short and longer now',
    );
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(
      await screen.findByText(
        'Your password was changed. Sign in with your new password.',
      ),
    ).toBeVisible();
    expect(completed).toEqual({
      token: TOKEN,
      password: 'short and longer now',
    });
  });

  it('explains a used link and offers a new one', async () => {
    open(`/reset-password?token=${TOKEN}`, {
      'POST /api/v1/auth/password-reset/check': () =>
        problem(410, 'RESET_LINK_USED', 'Used.'),
    });

    expect(
      await screen.findByRole('heading', {
        name: 'This reset link has already been used',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Ask for a new link' }),
    ).toHaveAttribute('href', '/forgot-password');
  });

  it('explains a link that expires while the page is open', async () => {
    const { user } = open(`/reset-password?token=${TOKEN}`, {
      'POST /api/v1/auth/password-reset/check': () =>
        json(200, {
          email: 'amara.bello@meridian.example',
          expiresAt: '2026-10-22T15:00:00.000Z',
        }),
      'POST /api/v1/auth/password-reset/complete': () =>
        problem(410, 'RESET_LINK_EXPIRED', 'Expired.'),
    });

    await user.type(
      await screen.findByLabelText(/New password/),
      'a long new passphrase',
    );
    await user.type(
      screen.getByLabelText(/Type it again/),
      'a long new passphrase',
    );
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(
      await screen.findByRole('heading', {
        name: 'This reset link has expired',
      }),
    ).toBeVisible();
  });

  it('explains a link without its token', async () => {
    const { calls } = open('/reset-password');

    expect(
      await screen.findByRole('heading', {
        name: 'This reset link is not valid',
      }),
    ).toBeVisible();
    expect(calls).not.toContain('POST /api/v1/auth/password-reset/check');
  });
});
