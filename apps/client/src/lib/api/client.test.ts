import { API_ROUTES } from '@sims/contracts';
import { problem, SESSION } from '@/test/fake-api';
import { buildUrl, request } from './client';
import { ApiError } from './errors';
import { currentToken, setSession } from './session-token';

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('buildUrl', () => {
  it('fills path params and drops empty query values', () => {
    expect(
      buildUrl(
        API_ROUTES.getUpdate,
        { periodId: 'p 1', initiativeId: 'i/2' },
        {},
      ),
    ).toBe('/api/v1/periods/p%201/updates/i%2F2');
    expect(
      buildUrl(
        API_ROUTES.listInitiatives,
        {},
        {
          health: ['RED', 'AMBER'],
          page: 2,
          q: '',
          elementId: undefined,
        },
      ),
    ).toBe('/api/v1/initiatives?health=RED%2CAMBER&page=2');
  });

  it('refuses to build a path with a missing param', () => {
    expect(() => buildUrl(API_ROUTES.getInitiative, {}, {})).toThrow(
      'Missing path parameter "id"',
    );
  });
});

describe('request', () => {
  beforeEach(() => setSession({ ...SESSION, accessToken: 'expired-token' }));

  it('renews an expired token once and retries', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith('/auth/refresh')) return ok(SESSION);
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === `Bearer ${SESSION.accessToken}`
        ? ok({ period: null, items: [] })
        : problem(401, 'UNAUTHENTICATED', 'Sign in again.');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(request('getMyUpdates')).resolves.toEqual({
      period: null,
      items: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(currentToken()?.accessToken).toBe(SESSION.accessToken);
  });

  it('shares one refresh between calls that fail at the same time', async () => {
    let refreshes = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        if (url.endsWith('/auth/refresh')) {
          refreshes += 1;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return ok(SESSION);
        }
        const auth = (init.headers as Record<string, string>).Authorization;
        return auth === `Bearer ${SESSION.accessToken}`
          ? ok({ period: null, items: [] })
          : problem(401, 'UNAUTHENTICATED', 'Sign in again.');
      }),
    );

    await Promise.all([
      request('getMyUpdates'),
      request('getMyUpdates'),
      request('getMyUpdates'),
    ]);
    expect(refreshes).toBe(1);
  });

  it('turns Problem Details into an ApiError with its code', async () => {
    setSession(SESSION);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => problem(404, 'INITIATIVE_NOT_FOUND', 'Not found.')),
    );
    const error = await request('getInitiative', {
      params: { id: 'x' },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'INITIATIVE_NOT_FOUND' });
  });

  it('reports being offline as a network error', async () => {
    setSession(SESSION);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(request('getMyUpdates')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });
});
