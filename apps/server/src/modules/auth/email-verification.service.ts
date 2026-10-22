import {
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
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
import { verifyEmail, welcomeEmail } from './verification-email.js';
import {
  EMAIL_VERIFICATION_TTL_DAYS,
  type EmailVerificationResult,
} from '@sims/contracts';

/** One new link per account per minute, on top of the per-IP limit. */
const RESEND_GAP_MS = 60_000;

const invalidLink = () =>
  new NotFoundException({
    code: 'VERIFY_LINK_INVALID',
    message: 'This confirmation link is not valid.',
  });
const expiredLink = () =>
  new GoneException({
    code: 'VERIFY_LINK_EXPIRED',
    message: 'This confirmation link has expired. Send a new one from SIMS.',
  });

/**
 * Confirming that a person owns the email they signed up with. Sign-up sends
 * a welcome email with a one-time link; the signed-in user can ask for the
 * link again. Unconfirmed accounts keep working: the web app reminds them.
 *
 * Accepting an invitation or resetting a password also proves the address
 * (the link went to it), so those mark it confirmed too.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(ENV) env: Env,
  ) {
    this.appUrl = env.APP_URL.replace(/\/+$/, '');
  }

  /** The welcome email at sign-up. Never fails the sign-up: problems are logged. */
  async sendWelcome(userId: string, organisationName: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      const url = await this.newLink(userId);
      this.sendLater(
        user.email,
        welcomeEmail({
          name: user.name,
          organisationName,
          verifyUrl: url,
          appUrl: this.appUrl,
          validDays: EMAIL_VERIFICATION_TTL_DAYS,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Could not prepare the welcome email: ${(error as Error).message}`,
      );
    }
  }

  /** "Send the link again", for the signed-in user. */
  async resend(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.emailVerifiedAt) {
      throw new ConflictException({
        code: 'ALREADY_VERIFIED',
        message: 'Your email address is already confirmed.',
      });
    }
    const recent = await this.prisma.emailVerificationToken.findFirst({
      where: {
        userId,
        createdAt: { gt: new Date(Date.now() - RESEND_GAP_MS) },
      },
      select: { id: true },
    });
    if (recent) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message:
            'A link was sent less than a minute ago. Check your inbox, or try again shortly.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const url = await this.newLink(userId);
    this.sendLater(
      user.email,
      verifyEmail({
        name: user.name,
        verifyUrl: url,
        validDays: EMAIL_VERIFICATION_TTL_DAYS,
      }),
    );
  }

  async verify(token: string): Promise<EmailVerificationResult> {
    const link = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashSecureToken(token) },
      include: { user: { select: { email: true, emailVerifiedAt: true } } },
    });
    if (!link) throw invalidLink();
    // Already confirmed (this link or another way): nothing left to do.
    if (link.usedAt || link.user.emailVerifiedAt) {
      return { email: link.user.email };
    }
    if (link.expiresAt <= new Date()) throw expiredLink();

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: link.id },
        data: { usedAt: now },
      }),
      this.prisma.user.update({
        where: { id: link.userId },
        data: { emailVerifiedAt: now },
      }),
      this.prisma.emailVerificationToken.deleteMany({
        where: { userId: link.userId, usedAt: null },
      }),
    ]);
    return { email: link.user.email };
  }

  // ---------------------------------------------------------------------------

  /** A fresh link; earlier unused ones stop working. */
  private async newLink(userId: string): Promise<string> {
    const token = generateSecureToken();
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.deleteMany({
        where: { userId, usedAt: null },
      }),
      this.prisma.emailVerificationToken.create({
        data: {
          id: uuidv7(),
          userId,
          tokenHash: hashSecureToken(token),
          expiresAt: new Date(
            Date.now() + EMAIL_VERIFICATION_TTL_DAYS * 86_400_000,
          ),
        },
      }),
    ]);
    return `${this.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
  }

  /** Sends without making the caller wait; a failure is logged. */
  private sendLater(to: string, message: Omit<MailMessage, 'to'>) {
    void this.mailer.send({ to, ...message }).catch((error: unknown) => {
      this.logger.warn(
        `Could not send the email to confirm an address: ${(error as Error).message}`,
      );
    });
  }
}
