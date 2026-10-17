import type { CookieOptions, Request, Response } from 'express';
import type { IssuedRefreshToken } from './tokens/refresh-token.service.js';

export const REFRESH_COOKIE = 'sims_rt';
/** The browser sends the cookie only to auth endpoints, never to data APIs. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * The refresh token lives in an httpOnly cookie: page scripts (and any XSS)
 * cannot read it. SameSite=Strict stops other sites from triggering a refresh.
 * The short-lived access token is returned in the body and kept in memory.
 */
const baseOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  secure,
  sameSite: 'strict',
  path: REFRESH_COOKIE_PATH,
});

export function setRefreshCookie(
  res: Response,
  token: IssuedRefreshToken,
  secure: boolean,
): void {
  res.cookie(REFRESH_COOKIE, token.token, {
    ...baseOptions(secure),
    expires: token.expiresAt,
  });
}

export function clearRefreshCookie(res: Response, secure: boolean): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions(secure));
}

export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
