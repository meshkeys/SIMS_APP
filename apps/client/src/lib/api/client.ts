import {
  API_ROUTES,
  type ApiRoute,
  type OperationId,
  type Problem,
  type SessionResponse,
} from '@sims/contracts';
import { ApiError } from './errors';
import { currentToken, setSession, tokenExpiring } from './session-token';
import type { ApiInput, ApiResult, NoInputOperation } from './types';

export const API_BASE = '/api/v1';

/** "/initiatives/{id}" + { id } → "/api/v1/initiatives/0192…" */
export function buildUrl(
  route: ApiRoute,
  params: Record<string, string> = {},
  query: Record<string, unknown> = {},
): string {
  const path = route.path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (!value) throw new Error(`Missing path parameter "${name}"`);
    return encodeURIComponent(value);
  });
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    // Lists travel comma-separated (e.g. health=RED,AMBER).
    search.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const qs = search.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

// ---------------------------------------------------------------------------
// Session refresh: one at a time, across every open tab.
// ---------------------------------------------------------------------------

let refreshing: Promise<SessionResponse | null> | null = null;

/**
 * Rotating refresh tokens treat a second use of an old token as theft and
 * sign the whole session out. Two tabs refreshing at the same moment would
 * look exactly like that, so refreshes are serialised with the Web Locks API;
 * the second tab then refreshes with the cookie the first one received.
 */
function withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request('sims:refresh-session', work) : work();
}

/** Gets a new access token from the refresh cookie; null when signed out. */
export function refreshSession(): Promise<SessionResponse | null> {
  refreshing ??= withRefreshLock(async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        setSession(null);
        return null;
      }
      const session = (await response.json()) as SessionResponse;
      setSession(session);
      return session;
    } catch {
      // Offline: keep whatever session we had; the next call will retry.
      return null;
    }
  }).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

async function toApiError(response: Response): Promise<ApiError> {
  let problem: Problem | null = null;
  try {
    problem = (await response.json()) as Problem;
  } catch {
    // Not JSON (e.g. a proxy error page).
  }
  const retryAfter = Number(response.headers.get('Retry-After'));
  return new ApiError({
    status: response.status,
    code: problem?.code ?? `HTTP_${response.status}`,
    message: problem?.detail ?? problem?.title ?? response.statusText,
    problem,
    retryAfter:
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  });
}

async function send(
  route: ApiRoute,
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = currentToken();
  if (token && route.access !== 'public') {
    headers.Authorization = `Bearer ${token.accessToken}`;
  }
  try {
    return await fetch(url, {
      method: route.method.toUpperCase(),
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw ApiError.network(cause);
  }
}

/** Called when the session cannot be renewed (e.g. to show the sign-in page). */
let onSignedOut: () => void = () => {};
export function setSignedOutHandler(handler: () => void): void {
  onSignedOut = handler;
}

/**
 * Calls one API operation by its contract id. Path params, query, body and
 * result are all typed from `@sims/contracts`; an expired access token is
 * renewed once, transparently.
 */
/**
 * Sends a request with the access token, renewing it once if it expired.
 * Resolves only for success; any error answer becomes an ApiError.
 */
async function call(
  route: ApiRoute,
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const needsAuth = route.access !== 'public';
  if (needsAuth && currentToken() && tokenExpiring()) await refreshSession();

  let response = await send(route, url, body, signal);
  if (response.status === 401 && needsAuth) {
    const renewed = await refreshSession();
    if (!renewed) {
      onSignedOut();
      throw await toApiError(response);
    }
    response = await send(route, url, body, signal);
  }
  if (!response.ok) throw await toApiError(response);
  return response;
}

type RequestOptions = { signal?: AbortSignal };
type RequestArgs<Id extends OperationId> = Id extends NoInputOperation
  ? [input?: ApiInput<Id>, options?: RequestOptions]
  : [input: ApiInput<Id>, options?: RequestOptions];

export async function request<Id extends OperationId>(
  id: Id,
  ...args: RequestArgs<Id>
): Promise<ApiResult<Id>> {
  const [input = {}, options = {}] = args as [
    { params?: Record<string, string>; query?: object; body?: unknown }?,
    RequestOptions?,
  ];
  const route = API_ROUTES[id] as ApiRoute;
  const url = buildUrl(
    route,
    input.params,
    input.query as Record<string, unknown> | undefined,
  );
  const response = await call(route, url, input.body, options.signal);
  if (response.status === 204 || route.response === null)
    return undefined as ApiResult<Id>;

  const data: unknown = await response.json();
  if (import.meta.env.DEV) {
    // Catch contract drift early while developing; production trusts the server.
    const check = route.response.safeParse(data);
    if (!check.success) {
      console.warn(
        `[api] ${id} response does not match the contract`,
        check.error.issues,
      );
    }
  }
  return data as ApiResult<Id>;
}

/** File-download operations (e.g. the Excel export). */
type DownloadOperation = {
  [Id in OperationId]: (typeof API_ROUTES)[Id] extends { produces: string }
    ? Id
    : never;
}[OperationId];

/**
 * Downloads a file from the API (with the same sign-in handling as JSON
 * calls) and returns it with the file name the server chose.
 */
export async function download<Id extends DownloadOperation>(
  id: Id,
  ...args: RequestArgs<Id>
): Promise<{ blob: Blob; fileName: string }> {
  const [input = {}, options = {}] = args as [
    { params?: Record<string, string>; query?: object }?,
    RequestOptions?,
  ];
  const route = API_ROUTES[id] as ApiRoute;
  const url = buildUrl(
    route,
    input.params,
    input.query as Record<string, unknown> | undefined,
  );
  const response = await call(route, url, undefined, options.signal);
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'download';
  return { blob: await response.blob(), fileName };
}
