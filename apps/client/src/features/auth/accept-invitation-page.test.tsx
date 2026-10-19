import type { InvitationPreview } from '@sims/contracts';
import { render, screen, waitFor } from '@testing-library/react';
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

const TOKEN = 'invitation-token-0123456789abcdef';

const PREVIEW: InvitationPreview = {
  organisationName: 'Meridian Financial Group',
  email: 'kemi@meridian.example',
  roles: ['INITIATIVE_OWNER', 'TASK_OWNER'],
  jobTitle: 'Head, Payments',
  invitedByName: 'Amara Bello',
  expiresAt: '2026-10-26T09:00:00.000Z',
  accountExists: false,
};

function open(
  routes: Record<string, FakeRoute>,
  path = `/accept-invitation?token=${TOKEN}`,
) {
  setSession(null);
  window.history.replaceState(null, '', path);
  const api = fakeApi({ routes });
  return { ...api, ...render(<App />), user: userEvent.setup() };
}

describe('accepting an invitation', () => {
  it('shows who invited them and to what, then creates their account', async () => {
    let sent: unknown;
    const { user, container } = open({
      'POST /api/v1/invitations/lookup': () => json(200, PREVIEW),
      'POST /api/v1/invitations/accept': (init) => {
        sent = JSON.parse(String(init.body));
        return json(200, SESSION);
      },
    });

    expect(
      await screen.findByRole('heading', {
        name: 'Join Meridian Financial Group',
      }),
    ).toBeVisible();
    expect(screen.getByText('Amara Bello invited you to SIMS.')).toBeVisible();
    expect(screen.getByText('Initiative owner, Task owner')).toBeVisible();
    expect(screen.getByText('26 October 2026')).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);

    await user.click(
      screen.getByRole('button', { name: 'Create account and join' }),
    );
    expect(screen.getByText('Enter your name')).toBeVisible();
    expect(screen.getByText('Enter a password')).toBeVisible();

    await user.type(
      screen.getByRole('textbox', { name: /Your name/ }),
      'Kemi Adebayo',
    );
    await user.type(
      screen.getByLabelText(/Choose a password/),
      'payments-are-my-thing',
    );
    await user.click(
      screen.getByRole('button', { name: 'Create account and join' }),
    );

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(sent).toEqual({
      token: TOKEN,
      name: 'Kemi Adebayo',
      password: 'payments-are-my-thing',
    });
  });

  it('asks someone who already uses SIMS for their password only', async () => {
    const { user } = open({
      'POST /api/v1/invitations/lookup': () =>
        json(200, { ...PREVIEW, accountExists: true }),
      'POST /api/v1/invitations/accept': () =>
        problem(401, 'INVALID_CREDENTIALS', 'Wrong password.'),
    });

    await user.type(
      await screen.findByLabelText(/Your password/),
      'not-my-password',
    );
    expect(screen.queryByRole('textbox', { name: /Your name/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Sign in and join' }));

    expect(
      await screen.findByText(
        'That password does not match your SIMS account.',
      ),
    ).toBeVisible();
  });

  it('explains an expired link', async () => {
    open({
      'POST /api/v1/invitations/lookup': () =>
        problem(410, 'INVITATION_EXPIRED', 'Expired.'),
    });

    expect(
      await screen.findByRole('heading', {
        name: 'This invitation has expired',
      }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toBeVisible();
  });

  it('explains a link without its token', async () => {
    const { calls } = open({}, '/accept-invitation');

    expect(
      await screen.findByRole('heading', {
        name: 'This invitation link is not valid',
      }),
    ).toBeVisible();
    expect(calls).not.toContain('POST /api/v1/invitations/lookup');
  });
});
