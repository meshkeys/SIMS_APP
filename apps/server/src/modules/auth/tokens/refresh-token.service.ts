import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  generateSecureToken,
  hashSecureToken,
} from '../../../common/crypto/secure-token.js';
import { uuidv7 } from '../../../common/ids/uuidv7.js';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.js';
import { PrismaService } from '../../../infrastructure/database/index.js';

export interface ClientMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface IssuedRefreshToken {
  /** The raw token: sent to the client once, never stored. */
  token: string;
  expiresAt: Date;
  familyId: string;
}

export interface RotatedRefreshToken extends IssuedRefreshToken {
  userId: string;
  organisationId: string | null;
}

/** A rotated token re-presented within this window is a benign race (two tabs), not theft. */
const REUSE_GRACE_MS = 30_000;

const invalid = (code: string, message: string) =>
  new UnauthorizedException({ code, message });

/**
 * Opaque, rotating refresh tokens with reuse detection.
 *
 * - Only a SHA-256 hash is stored, so a database leak yields no usable tokens.
 * - Every refresh replaces the token (rotation). All tokens from one sign-in
 *   share a `familyId`.
 * - Presenting an already-rotated token means it was copied: the whole family
 *   is revoked and the user must sign in again.
 *
 * RefreshToken is user-scoped (not tenant data), so it has no RLS and is
 * accessed through the base client.
 */
@Injectable()
export class RefreshTokenService {
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) env: Env,
  ) {
    this.ttlMs = env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;
  }

  async issue(
    userId: string,
    organisationId: string,
    meta: ClientMeta,
    familyId: string = randomUUID(),
  ): Promise<IssuedRefreshToken> {
    const token = generateSecureToken();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.prisma.refreshToken.create({
      data: {
        id: uuidv7(),
        userId,
        familyId,
        activeOrganisationId: organisationId,
        tokenHash: hashSecureToken(token),
        expiresAt,
        userAgent: meta.userAgent?.slice(0, 400),
        ipAddress: meta.ipAddress,
      },
    });
    return { token, expiresAt, familyId };
  }

  /**
   * Exchanges a valid token for a new one in the same family.
   * `organisationId` switches the session to another workspace.
   */
  async rotate(
    token: string,
    meta: ClientMeta,
    organisationId?: string,
  ): Promise<RotatedRefreshToken> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashSecureToken(token) },
    });
    if (!current)
      throw invalid('INVALID_REFRESH_TOKEN', 'Please sign in again.');

    if (current.revokedAt) {
      const recentlyRotated =
        current.replacedById !== null &&
        Date.now() - current.revokedAt.getTime() < REUSE_GRACE_MS;
      if (!recentlyRotated) await this.revokeFamily(current.familyId);
      throw invalid('REFRESH_TOKEN_REUSED', 'Please sign in again.');
    }
    if (current.expiresAt <= new Date()) {
      throw invalid(
        'REFRESH_TOKEN_EXPIRED',
        'Your session has ended. Please sign in again.',
      );
    }

    const next = generateSecureToken();
    const nextId = uuidv7();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    const targetOrg = organisationId ?? current.activeOrganisationId;

    const rotated = await this.prisma.$transaction(async (tx) => {
      // Conditional update: exactly one concurrent caller wins the rotation.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: nextId },
      });
      if (count === 0) return false;
      await tx.refreshToken.create({
        data: {
          id: nextId,
          userId: current.userId,
          familyId: current.familyId,
          activeOrganisationId: targetOrg,
          tokenHash: hashSecureToken(next),
          expiresAt,
          userAgent: meta.userAgent?.slice(0, 400),
          ipAddress: meta.ipAddress,
        },
      });
      return true;
    });
    if (!rotated)
      throw invalid('REFRESH_TOKEN_REUSED', 'Please sign in again.');

    return {
      token: next,
      expiresAt,
      familyId: current.familyId,
      userId: current.userId,
      organisationId: targetOrg,
    };
  }

  /** Signs out every device that shares this sign-in. Unknown tokens are ignored. */
  async revoke(token: string): Promise<void> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashSecureToken(token) },
      select: { familyId: true },
    });
    if (current) await this.revokeFamily(current.familyId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
