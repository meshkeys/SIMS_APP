import { UnauthorizedException } from '@nestjs/common';
import { SignJWT } from 'jose';
import type { Env } from '../../../config/env.js';
import type { AuthContext } from '../auth-context.js';
import { AccessTokenService } from './access-token.service.js';

const SECRET = 'a'.repeat(48);
const env = { JWT_ACCESS_SECRET: SECRET, ACCESS_TOKEN_TTL_SECONDS: 900 } as Env;

const auth: AuthContext = {
  userId: '0199f0a0-0000-7000-8000-000000000001',
  organisationId: '0199f0a0-0000-7000-8000-000000000002',
  membershipId: '0199f0a0-0000-7000-8000-000000000003',
  sessionId: '0199f0a0-0000-7000-8000-000000000004',
  roles: ['STRATEGY_OFFICE'],
};

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(UnauthorizedException);
    return ((error as UnauthorizedException).getResponse() as { code: string })
      .code;
  }
}

describe('AccessTokenService', () => {
  const service = new AccessTokenService(env);

  it('round-trips the caller identity', async () => {
    const { token, expiresAt } = await service.issue(auth);

    await expect(service.verify(token)).resolves.toEqual(auth);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(890_000);
  });

  it('rejects a token signed with another key', async () => {
    const other = new AccessTokenService({
      ...env,
      JWT_ACCESS_SECRET: 'b'.repeat(48),
    });
    const { token } = await other.issue(auth);

    expect(await codeOf(service.verify(token))).toBe('INVALID_TOKEN');
  });

  it('reports expiry distinctly so clients know to refresh', async () => {
    const expired = await new SignJWT({
      org: auth.organisationId,
      mid: auth.membershipId,
      sid: auth.sessionId,
      roles: auth.roles,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(auth.userId)
      .setIssuer('sims-api')
      .setAudience('sims')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 1000)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 100)
      .sign(new TextEncoder().encode(SECRET));

    expect(await codeOf(service.verify(expired))).toBe('TOKEN_EXPIRED');
  });

  it('rejects unsigned ("alg: none") tokens', async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: auth.userId,
        org: auth.organisationId,
        mid: auth.membershipId,
        sid: auth.sessionId,
        roles: [],
        iss: 'sims-api',
        aud: 'sims',
        exp: 9_999_999_999,
      }),
    ).toString('base64url');

    expect(await codeOf(service.verify(`${header}.${payload}.`))).toBe(
      'INVALID_TOKEN',
    );
  });

  it('rejects tokens with unexpected claims', async () => {
    const odd = await new SignJWT({
      org: 'not-a-uuid',
      mid: auth.membershipId,
      sid: auth.sessionId,
      roles: ['GOD_MODE'],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(auth.userId)
      .setIssuer('sims-api')
      .setAudience('sims')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(SECRET));

    expect(await codeOf(service.verify(odd))).toBe('INVALID_TOKEN');
  });
});
