import type { SessionResponse, SessionView } from '@sims/contracts';

/**
 * The access token lives in memory only (never localStorage), so a script
 * injected into the page cannot read it from storage, and it disappears with
 * the tab. The long-lived refresh token is an httpOnly cookie the page never
 * sees. A reload restores the session through the refresh endpoint.
 */
interface TokenState {
  accessToken: string;
  expiresAt: number;
  session: SessionView;
}

let state: TokenState | null = null;
const listeners = new Set<(session: SessionView | null) => void>();

export function currentToken(): TokenState | null {
  return state;
}

export function setSession(response: SessionResponse | null): void {
  state = response
    ? {
        accessToken: response.accessToken,
        expiresAt: Date.parse(response.accessTokenExpiresAt),
        session: response.session,
      }
    : null;
  for (const listener of listeners) listener(state?.session ?? null);
}

/** Notified whenever the user signs in, refreshes, switches or is signed out. */
export function onSessionChange(
  listener: (session: SessionView | null) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when the token is missing or expires within `marginMs`. */
export function tokenExpiring(marginMs = 30_000): boolean {
  return !state || state.expiresAt - Date.now() < marginMs;
}
