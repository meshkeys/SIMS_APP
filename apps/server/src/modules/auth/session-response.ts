import type { Response } from 'express';
import type { IssuedSession } from './auth.service.js';
import { setRefreshCookie } from './refresh-cookie.js';
import type { SessionResponse } from '@sims/contracts';

/**
 * Puts the refresh token in its cookie and returns the response body.
 * Used by every endpoint that signs someone in (login, sign-up, refresh,
 * switching workspace, accepting an invitation) so they behave identically.
 */
export function sendSession(
  res: Response,
  session: IssuedSession,
  secureCookies: boolean,
): SessionResponse {
  setRefreshCookie(res, session.refreshToken, secureCookies);
  res.setHeader('Cache-Control', 'no-store');
  return {
    accessToken: session.accessToken.token,
    accessTokenExpiresAt: session.accessToken.expiresAt.toISOString(),
    session: session.view,
  };
}
