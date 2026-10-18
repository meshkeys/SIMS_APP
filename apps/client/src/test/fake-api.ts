import type { MyUpdates, SessionResponse } from '@sims/contracts';

export const SESSION: SessionResponse = {
  accessToken: 'access-token-1',
  accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  session: {
    user: {
      id: '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
      name: 'Amara Bello',
      email: 'amara.bello@meridian.example',
    },
    organisation: {
      id: '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c',
      name: 'Meridian Financial Group',
      slug: 'meridian',
      status: 'ACTIVE',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      terminology: null,
      onboardingStep: 5,
    },
    membership: {
      id: '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d',
      roles: ['STRATEGY_OFFICE', 'SYSTEM_ADMIN'],
      jobTitle: 'Head, Strategy Office',
    },
    organisations: [],
  },
};

const MY_UPDATES: MyUpdates = {
  period: null,
  items: [true, true, false].map((actionNeeded, i) => ({
    initiativeId: `0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a6${i}`,
    code: `DIG-00${i}`,
    title: `Initiative ${i}`,
    status: actionNeeded ? 'DRAFT' : 'APPROVED',
    actionNeeded,
    dueAt: null,
    overdue: false,
    savedAt: null,
    submittedAt: null,
  })),
};

const json = (
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

export const problem = (status: number, code: string, detail: string) =>
  json(status, {
    type: 'about:blank',
    title: 'Error',
    status,
    code,
    detail,
    instance: '/api/v1/test',
  });

/**
 * A small stand-in for the API: signed out until a correct sign-in, then
 * serving the session and "my updates". Records every call.
 */
export function fakeApi(options: { signedIn?: boolean } = {}) {
  let signedIn = options.signedIn ?? false;
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const path = new URL(url, 'http://localhost').pathname;
    calls.push(`${method} ${path}`);
    switch (`${method} ${path}`) {
      case 'POST /api/v1/auth/refresh':
        return signedIn
          ? json(200, SESSION)
          : problem(401, 'INVALID_REFRESH_TOKEN', 'Sign in again.');
      case 'POST /api/v1/auth/login': {
        const body = JSON.parse(String(init.body)) as { password: string };
        if (body.password !== 'correct-password') {
          return problem(
            401,
            'INVALID_CREDENTIALS',
            'Invalid email or password.',
          );
        }
        signedIn = true;
        return json(200, SESSION);
      }
      case 'POST /api/v1/auth/logout':
        signedIn = false;
        return json(204);
      case 'GET /api/v1/my-updates':
        return json(200, MY_UPDATES);
      default:
        return problem(404, 'NOT_FOUND', `No fake for ${method} ${path}`);
    }
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}
