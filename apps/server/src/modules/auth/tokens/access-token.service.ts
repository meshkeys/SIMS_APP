import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { errors, jwtVerify, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.js';
import { Role } from '../../../generated/prisma/enums.js';
import type { AuthContext } from '../auth-context.js';

const ISSUER = 'sims-api';
const AUDIENCE = 'sims';
const ALGORITHM = 'HS256';

const claimsSchema = z.object({
  sub: z.uuid(),
  org: z.uuid(),
  mid: z.uuid(),
  sid: z.uuid(),
  roles: z.array(z.enum(Role)),
});

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

/**
 * Short-lived, stateless bearer tokens (JWT, HS256). Verifying one needs no
 * database round-trip, which keeps every authenticated request cheap at scale.
 * The short lifetime bounds how long a role change or deactivation can lag.
 */
@Injectable()
export class AccessTokenService {
  private readonly key: Uint8Array;
  private readonly ttlSeconds: number;

  constructor(@Inject(ENV) env: Env) {
    this.key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    this.ttlSeconds = env.ACCESS_TOKEN_TTL_SECONDS;
  }

  async issue(auth: AuthContext): Promise<IssuedAccessToken> {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + this.ttlSeconds;
    const token = await new SignJWT({
      org: auth.organisationId,
      mid: auth.membershipId,
      sid: auth.sessionId,
      roles: [...auth.roles],
    })
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(auth.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .setJti(randomUUID())
      .sign(this.key);
    return { token, expiresAt: new Date(expiresAt * 1000) };
  }

  /** Returns the caller's identity, or throws 401 for any invalid token. */
  async verify(token: string): Promise<AuthContext> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: [ALGORITHM], // never accept "none" or a different algorithm
      });
      const claims = claimsSchema.parse(payload);
      return {
        userId: claims.sub,
        organisationId: claims.org,
        membershipId: claims.mid,
        sessionId: claims.sid,
        roles: claims.roles,
      };
    } catch (error) {
      const expired = error instanceof errors.JWTExpired;
      throw new UnauthorizedException({
        code: expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
        message: expired
          ? 'Your session has expired. Refresh it and try again.'
          : 'The access token is invalid.',
      });
    }
  }
}
