import type { SessionResponse } from '@sims/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app';
import { setSession } from '@/lib/api/session-token';
import { axeViolations } from '@/test/axe';
import {
  type FakeRoute,
  fakeApi,
  json,
  problem,
  SESSION,
} from '@/test/fake-api';

const TOKEN = 'verify-token-0123456789abcdefghij';

const UNCONFIRMED: SessionResponse = {
  ...SESSION,
  session: {
    ...SESSION.session,
    user: { ...SESSION.session.user, emailVerified: false },
  },
};

function open(
  path: string,
  options: {
    signedIn?: boolean;
    session?: SessionResponse;
    routes?: Record<string, FakeRoute>;
  } = {},
) {
  setSession(null);
  window.history.replaceState(null, '', path);
  const api = fakeApi({
    signedIn: options.signedIn,
    session: options.session,
    routes: options.routes,
  });
  return { ...api, ...render(<App />), user: userEvent.setup() };
}

describe('confirming an email address', () => {
  it('confirms from the link, without signing in', async () => {
    const { container } = open(`/verify-email?token=${TOKEN}`, {
      routes: {
        'POST /api/v1/auth/verify-email': () =>
          json(200, { email: 'efua@coastal.example' }),
      },
    });

    expect(
      await screen.findByRole('heading', { name: 'Email confirmed' }),
    ).toBeVisible();
    expect(screen.getByText('efua@coastal.example')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('explains an expired link', async () => {
    open(`/verify-email?token=${TOKEN}`, {
      routes: {
        'POST /api/v1/auth/verify-email': () =>
          problem(410, 'VERIFY_LINK_EXPIRED', 'Expired.'),
      },
    });

    expect(
      await screen.findByRole('heading', {
        name: 'This confirmation link has expired',
      }),
    ).toBeVisible();
  });

  it('reminds an unconfirmed user, and sends the link again', async () => {
    let resent = 0;
    const { user } = open('/', {
      signedIn: true,
      session: UNCONFIRMED,
      routes: {
        'POST /api/v1/auth/verify-email/resend': () => {
          resent++;
          return json(204);
        },
      },
    });

    expect(
      await screen.findByText(/Confirm your email address: we sent a link to/),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Send the link again' }),
    );

    expect(
      await screen.findByText(/A new link is on its way to/),
    ).toBeVisible();
    expect(resent).toBe(1);
  });

  it('shows no reminder once the address is confirmed', async () => {
    open('/', { signedIn: true });

    await screen.findByRole('main');
    expect(
      screen.queryByText(/Confirm your email address/),
    ).not.toBeInTheDocument();
  });

  it('says when a new link was sent too recently', async () => {
    const { user } = open('/', {
      signedIn: true,
      session: UNCONFIRMED,
      routes: {
        'POST /api/v1/auth/verify-email/resend': () =>
          problem(
            429,
            'RATE_LIMITED',
            'A link was sent less than a minute ago.',
          ),
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Send the link again' }),
    );

    expect(
      await screen.findByText(/Too many attempts|less than a minute ago/),
    ).toBeVisible();
  });
});
