import {
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  generateSecureToken,
  hashSecureToken,
} from '../../common/crypto/secure-token.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../infrastructure/database/index.js';
import {
  MAILER,
  type Mailer,
  type MailMessage,
} from '../../infrastructure/mail/index.js';
import { AuthDirectory } from './auth-directory.js';
import { hashPassword } from './passwords.js';
import {
  passwordChangedEmail,
  passwordResetEmail,
} from './password-reset-email.js';
import type { ClientMeta } from './tokens/refresh-token.service.js';
import {
  PASSWORD_RESET_TTL_MINUTES,
  type PasswordResetCompleteInput,
  type PasswordResetPreview,
  type PasswordResetRequestInput,
} from '@sims/contracts';

/** One new link per account per minute, on top of the per-IP limit. */
const RESEND_GAP_MS = 60_000;

const invalidLink = () =>
  new NotFoundException({
    code: 'RESET_LINK_INVALID',
    message: 'This password reset link is not valid.',
  });
const usedLink = () =>
  new GoneException({
    code: 'RESET_LINK_USED',
    message: 'This password reset link has already been used.',
  });
const expiredLink = () =>
  new GoneException({
    code: 'RESET_LINK_EXPIRED',
    message: 'This password reset link has expired. Ask for a new one.',
  });

/**
 * "Forgot password": an emailed, one-time link to choose a new password.
 *
 * - Asking never reveals whether an email has an account: the answer is the
 *   same, and the email is sent after answering.
 * - Only the SHA-256 hash of the link's secret is stored; a link works once,
 *   for PASSWORD_RESET_TTL_MINUTES, and asking again replaces it.
 * - Setting the password signs the account out everywhere and sends a
 *   confirmation email.
 *
 * Users and their tokens are global (not tenant data), so this uses the base
 * client, like the rest of the auth module.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: AuthDirectory,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(ENV) env: Env,
  ) {
    this.appUrl = env.APP_URL.replace(/\/+$/, '');
  }

  async request(
    input: PasswordResetRequestInput,
    meta: ClientMeta,
  ): Promise<void> {
    const user = await this.directory.findUserByEmail(input.email);
    // No account, or one that signs in only with single sign-on: nothing to do,
    // and the caller cannot tell.
    if (!user?.passwordHash) return;

    const now = new Date();
    const recent = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        createdAt: { gt: new Date(now.getTime() - RESEND_GAP_MS) },
      },
      select: { id: true },
    });
    if (recent) return;

    const token = generateSecureToken();
    await this.prisma.$transaction([
      // Only the newest link works.
      this.prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          id: uuidv7(),
          userId: user.id,
          tokenHash: hashSecureToken(token),
          expiresAt: new Date(
            now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000,
          ),
          requestedIp: meta.ipAddress,
        },
      }),
    ]);
    this.sendLater(user.email, 'reset link', {
      ...passwordResetEmail({
        name: user.name,
        resetUrl: `${this.appUrl}/reset-password?token=${encodeURIComponent(token)}`,
        validMinutes: PASSWORD_RESET_TTL_MINUTES,
      }),
    });
  }

  /** What the "choose a new password" page shows, if the link still works. */
  async check(token: string): Promise<PasswordResetPreview> {
    const link = await this.open(token);
    return {
      email: link.user.email,
      expiresAt: link.expiresAt.toISOString(),
    };
  }

  async complete(input: PasswordResetCompleteInput): Promise<void> {
    const link = await this.open(input.token);
    const passwordHash = await hashPassword(input.password);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Claiming the link and changing the password happen together, once.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: link.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count === 0) throw usedLink();
      await tx.user.update({
        where: { id: link.userId },
        data: {
          passwordHash,
          // Opening the emailed link proves the address.
          emailVerifiedAt: link.user.emailVerifiedAt ?? now,
        },
      });
      await tx.passwordResetToken.deleteMany({
        where: { userId: link.userId, usedAt: null },
      });
      // Every session ends: whoever knew the old password is signed out.
      await tx.refreshToken.updateMany({
        where: { userId: link.userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });

    this.logger.log(`Password reset for user ${link.userId}`);
    this.sendLater(link.user.email, 'password-changed notice', {
      ...passwordChangedEmail({
        name: link.user.name,
        changedAt: now,
        signInUrl: `${this.appUrl}/login`,
      }),
    });
  }

  // ---------------------------------------------------------------------------

  private async open(token: string) {
    const link = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashSecureToken(token) },
      include: {
        user: {
          select: {
            email: true,
            name: true,
            emailVerifiedAt: true,
            passwordHash: true,
          },
        },
      },
    });
    if (!link || !link.user.passwordHash) throw invalidLink();
    if (link.usedAt) throw usedLink();
    if (link.expiresAt <= new Date()) throw expiredLink();
    return link;
  }

  /**
   * Sends without making the caller wait: the answer then takes the same
   * time whether or not an email goes out. A failure is logged; the person
   * can ask again.
   */
  private sendLater(
    to: string,
    what: string,
    message: Omit<MailMessage, 'to'>,
  ) {
    void this.mailer.send({ to, ...message }).catch((error: unknown) => {
      this.logger.warn(
        `Could not send the ${what}: ${(error as Error).message}`,
      );
    });
  }
}
