import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  generateSecureToken,
  hashSecureToken,
} from '../../common/crypto/secure-token.js';
import type { FieldError } from '../../common/http/problem-details.filter.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { rolesCallerCannotGrant } from '../../domain/roles/roles.js';
import type { Role } from '../../generated/prisma/enums.js';
import {
  TenantContext,
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import { MAILER, type Mailer } from '../../infrastructure/mail/index.js';
import {
  type AuthContext,
  AuthDirectory,
  AuthService,
  hashPassword,
  type IssuedSession,
  verifyPassword,
} from '../auth/index.js';
import type { ClientMeta } from '../auth/tokens/refresh-token.service.js';
import {
  InvitationDirectory,
  type InvitationByToken,
} from './invitation-directory.js';
import { invitationEmail } from './invitation-email.js';
import {
  type AcceptInvitationInput,
  type CreateInvitationInput,
  type InvitationPreview,
  type InvitationStatus,
  type InvitationView,
  type SentInvitation,
  newPasswordSchema,
} from '@sims/contracts';

/** How long an emailed link stays valid. */
const INVITATION_TTL_DAYS = 7;

const invitationSelect = {
  id: true,
  email: true,
  roles: true,
  jobTitle: true,
  departmentId: true,
  createdAt: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  invitedBy: { select: { id: true, user: { select: { name: true } } } },
} as const;

type InvitationRow = {
  id: string;
  email: string;
  roles: Role[];
  jobTitle: string | null;
  departmentId: string | null;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  invitedBy: { id: string; user: { name: string } };
};

const statusOf = (
  invitation: {
    acceptedAt: Date | null;
    revokedAt: Date | null;
    expiresAt: Date;
  },
  now = new Date(),
): InvitationStatus =>
  invitation.acceptedAt
    ? 'ACCEPTED'
    : invitation.revokedAt
      ? 'REVOKED'
      : invitation.expiresAt <= now
        ? 'EXPIRED'
        : 'PENDING';

const toView = (row: InvitationRow): InvitationView => ({
  id: row.id,
  email: row.email,
  roles: row.roles,
  jobTitle: row.jobTitle,
  departmentId: row.departmentId,
  status: statusOf(row),
  invitedBy: { id: row.invitedBy.id, name: row.invitedBy.user.name },
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt.toISOString(),
  acceptedAt: row.acceptedAt?.toISOString() ?? null,
  revokedAt: row.revokedAt?.toISOString() ?? null,
});

const expiry = () => new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly db: TenantPrismaService,
    private readonly invitations: InvitationDirectory,
    private readonly users: AuthDirectory,
    private readonly auth: AuthService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(ENV) env: Env,
  ) {
    this.appUrl = env.APP_URL.replace(/\/+$/, '');
  }

  // ---------------------------------------------------------------------------
  // Administration (runs in the caller's tenant context)
  // ---------------------------------------------------------------------------

  /**
   * Invites someone by email. Re-inviting the same address replaces the
   * earlier pending invitation, so only the newest link works.
   */
  async invite(
    caller: AuthContext,
    input: CreateInvitationInput,
  ): Promise<SentInvitation> {
    this.assertCanGrant(caller, input.roles);
    const token = generateSecureToken();

    const row = await this.db.transaction(async (tx) => {
      // Serialise invitations per organisation so two admins cannot both
      // take the last seat.
      const [subscription] = await tx.$queryRaw<{ seats: number }[]>`
        SELECT seats FROM "Subscription"
        WHERE "organisationId" = ${caller.organisationId}::uuid FOR UPDATE`;

      const member = await tx.membership.findFirst({
        where: { user: { email: input.email }, status: 'ACTIVE' },
        select: { id: true },
      });
      if (member) {
        throw new ConflictException({
          code: 'ALREADY_MEMBER',
          message: `${input.email} is already a member of this organisation.`,
        });
      }
      if (input.departmentId)
        await this.assertDepartmentExists(tx, input.departmentId);

      await tx.invitation.updateMany({
        where: { email: input.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (subscription) {
        const members = await tx.membership.count({
          where: { status: 'ACTIVE' },
        });
        const pending = await tx.invitation.count({
          where: {
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        });
        if (members + pending >= subscription.seats) {
          throw new ConflictException({
            code: 'SEAT_LIMIT_REACHED',
            message: `All ${subscription.seats} seats on your plan are in use or reserved by pending invitations.`,
          });
        }
      }

      const created = await tx.invitation.create({
        data: {
          id: uuidv7(),
          organisationId: caller.organisationId,
          email: input.email,
          roles: input.roles,
          jobTitle: input.jobTitle,
          departmentId: input.departmentId,
          tokenHash: hashSecureToken(token),
          invitedById: caller.membershipId,
          expiresAt: expiry(),
        },
        select: invitationSelect,
      });
      await this.audit(tx, caller, 'INVITATION_SENT', created.id, {
        email: input.email,
        roles: input.roles,
      });
      return created;
    });

    const emailDelivered = await this.deliver(caller, row, token);
    return { ...toView(row), emailDelivered };
  }

  async list(): Promise<InvitationView[]> {
    const rows = await this.db.client.invitation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: invitationSelect,
    });
    return rows.map(toView);
  }

  /** Issues a fresh link (the old one stops working) and emails it again. */
  async resend(
    caller: AuthContext,
    invitationId: string,
  ): Promise<SentInvitation> {
    const token = generateSecureToken();
    const row = await this.db.transaction(async (tx) => {
      const current = await tx.invitation.findUnique({
        where: { id: invitationId },
        select: invitationSelect,
      });
      if (!current) throw notFound();
      const status = statusOf(current);
      if (status === 'ACCEPTED' || status === 'REVOKED') {
        throw new ConflictException({
          code: 'INVITATION_CLOSED',
          message: `This invitation was already ${status.toLowerCase()}.`,
        });
      }
      this.assertCanGrant(caller, current.roles);

      const updated = await tx.invitation.update({
        where: { id: invitationId },
        data: { tokenHash: hashSecureToken(token), expiresAt: expiry() },
        select: invitationSelect,
      });
      await this.audit(tx, caller, 'INVITATION_RESENT', invitationId, {
        email: current.email,
      });
      return updated;
    });

    const emailDelivered = await this.deliver(caller, row, token);
    return { ...toView(row), emailDelivered };
  }

  async revoke(caller: AuthContext, invitationId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const { count } = await tx.invitation.updateMany({
        where: { id: invitationId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) {
        const exists = await tx.invitation.findUnique({
          where: { id: invitationId },
          select: { id: true },
        });
        if (!exists) throw notFound();
        throw new ConflictException({
          code: 'INVITATION_CLOSED',
          message: 'This invitation was already accepted or revoked.',
        });
      }
      await this.audit(tx, caller, 'INVITATION_REVOKED', invitationId);
    });
  }

  // ---------------------------------------------------------------------------
  // Public accept flow (no session yet)
  // ---------------------------------------------------------------------------

  async preview(token: string): Promise<InvitationPreview> {
    const invitation = await this.openInvitation(token);
    const user = await this.users.findUserByEmail(invitation.email);
    return {
      organisationName: invitation.organisationName,
      email: invitation.email,
      roles: invitation.roles,
      jobTitle: invitation.jobTitle,
      invitedByName: invitation.invitedByName,
      expiresAt: invitation.expiresAt.toISOString(),
      accountExists: Boolean(user),
    };
  }

  /**
   * Joins the organisation and signs in.
   * - New person: provide a name and a new password; the account is created.
   * - Existing account: provide its password, proving it is theirs.
   * Using the emailed link proves the address, so it counts as verified.
   */
  async accept(
    input: AcceptInvitationInput,
    meta: ClientMeta,
  ): Promise<IssuedSession> {
    const invitation = await this.openInvitation(input.token);
    const existing = await this.users.findUserByEmail(invitation.email);

    let newAccount: { name: string; passwordHash: string } | undefined;
    if (existing) {
      if (!existing.passwordHash) {
        throw new ConflictException({
          code: 'PASSWORD_SIGNIN_UNAVAILABLE',
          message: 'This account signs in with single sign-on.',
        });
      }
      if (!(await verifyPassword(existing.passwordHash, input.password))) {
        throw new UnauthorizedException({
          code: 'INVALID_CREDENTIALS',
          message: 'That password does not match your existing account.',
        });
      }
    } else {
      newAccount = {
        name: this.requireNewAccountFields(input),
        passwordHash: await hashPassword(input.password),
      };
    }

    const userId = existing?.id ?? uuidv7();
    await TenantContext.run({ organisationId: invitation.organisationId }, () =>
      this.db.transaction(async (tx) => {
        const now = new Date();
        // Claim the invitation atomically: exactly one acceptance can win.
        const { count } = await tx.invitation.updateMany({
          where: {
            id: invitation.invitationId,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { acceptedAt: now },
        });
        if (count === 0) throw invitationUsed();

        if (newAccount) {
          await tx.user.create({
            data: {
              id: userId,
              email: invitation.email,
              name: newAccount.name,
              passwordHash: newAccount.passwordHash,
              emailVerifiedAt: now,
            },
          });
        } else if (!existing?.emailVerifiedAt) {
          await tx.user.update({
            where: { id: userId },
            data: { emailVerifiedAt: now },
          });
        }

        const membershipId = await this.joinOrganisation(
          tx,
          invitation,
          userId,
          now,
        );
        await tx.auditEvent.create({
          data: {
            id: uuidv7(),
            organisationId: invitation.organisationId,
            actorId: membershipId,
            action: 'INVITATION_ACCEPTED',
            entityType: 'Invitation',
            entityId: invitation.invitationId,
            after: { roles: invitation.roles, newAccount: Boolean(newAccount) },
            ipAddress: meta.ipAddress,
          },
        });
      }),
    );

    return this.auth.startSessionIn(userId, invitation.organisationId, meta);
  }

  // ---------------------------------------------------------------------------

  private async openInvitation(token: string): Promise<InvitationByToken> {
    const invitation = await this.invitations.findByToken(token);
    if (!invitation) throw notFound();
    if (invitation.acceptedAt || invitation.revokedAt) throw invitationUsed();
    if (invitation.expiresAt <= new Date()) {
      throw new GoneException({
        code: 'INVITATION_EXPIRED',
        message: 'This invitation has expired. Ask for a new one.',
      });
    }
    if (!['ACTIVE', 'ONBOARDING'].includes(invitation.organisationStatus)) {
      throw new GoneException({
        code: 'INVITATION_UNAVAILABLE',
        message: 'This organisation is not accepting new members.',
      });
    }
    return invitation;
  }

  /** Creates the membership, or reactivates a deactivated one with the invited roles. */
  private async joinOrganisation(
    tx: TenantTransactionClient,
    invitation: InvitationByToken,
    userId: string,
    now: Date,
  ): Promise<string> {
    const current = await tx.membership.findUnique({
      where: {
        organisationId_userId: {
          organisationId: invitation.organisationId,
          userId,
        },
      },
      select: { id: true, status: true },
    });
    const details = {
      roles: invitation.roles,
      jobTitle: invitation.jobTitle,
      departmentId: invitation.departmentId,
      status: 'ACTIVE' as const,
      joinedAt: now,
    };
    if (!current) {
      const id = uuidv7();
      await tx.membership.create({
        data: {
          id,
          organisationId: invitation.organisationId,
          userId,
          ...details,
        },
      });
      return id;
    }
    if (current.status === 'ACTIVE') {
      throw new ConflictException({
        code: 'ALREADY_MEMBER',
        message:
          'You are already a member of this organisation. Sign in instead.',
      });
    }
    await tx.membership.update({ where: { id: current.id }, data: details });
    return current.id;
  }

  private requireNewAccountFields(input: AcceptInvitationInput): string {
    const errors: FieldError[] = [];
    if (!input.name) {
      errors.push({
        path: 'name',
        message: 'Enter your name',
        code: 'invalid_type',
      });
    }
    const password = newPasswordSchema.safeParse(input.password);
    if (!password.success) {
      errors.push(
        ...password.error.issues.map((issue) => ({
          path: 'password',
          message: issue.message,
          code: issue.code,
        })),
      );
    }
    if (errors.length) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Some fields are missing or invalid.',
        errors,
      });
    }
    return input.name!;
  }

  private assertCanGrant(caller: AuthContext, roles: readonly Role[]): void {
    const forbidden = rolesCallerCannotGrant(caller.roles, roles);
    if (forbidden.length) {
      throw new ForbiddenException({
        code: 'CANNOT_GRANT_ROLE',
        message: `Only a system administrator can grant: ${forbidden.join(', ')}.`,
      });
    }
  }

  private async assertDepartmentExists(
    tx: TenantTransactionClient,
    departmentId: string,
  ) {
    // Row-level security makes another organisation's department invisible here.
    const department = await tx.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!department) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Some fields are missing or invalid.',
        errors: [
          {
            path: 'departmentId',
            message: 'Unknown department',
            code: 'not_found',
          },
        ],
      });
    }
  }

  /**
   * Sends the email after the invitation is committed. A mail outage must
   * not lose the invitation: it is reported (`emailDelivered: false`) and can
   * be resent. Moves to a retrying background job with the jobs module.
   */
  private async deliver(
    caller: AuthContext,
    row: InvitationRow,
    token: string,
  ): Promise<boolean> {
    try {
      const organisation = await this.db.client.organisation.findUniqueOrThrow({
        where: { id: caller.organisationId },
        select: { name: true, timezone: true },
      });
      await this.mailer.send({
        to: row.email,
        ...invitationEmail({
          organisationName: organisation.name,
          inviterName: row.invitedBy.user.name,
          roles: row.roles,
          acceptUrl: `${this.appUrl}/accept-invitation?token=${encodeURIComponent(token)}`,
          expiresAt: row.expiresAt,
          timezone: organisation.timezone,
        }),
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `Invitation ${row.id} saved but the email failed: ${(error as Error).message}`,
      );
      return false;
    }
  }

  private audit(
    tx: TenantTransactionClient,
    caller: AuthContext,
    action: string,
    invitationId: string,
    after?: Record<string, unknown>,
  ) {
    return tx.auditEvent.create({
      data: {
        id: uuidv7(),
        organisationId: caller.organisationId,
        actorId: caller.membershipId,
        action,
        entityType: 'Invitation',
        entityId: invitationId,
        after: after as never,
        requestId: TenantContext.current()?.requestId,
      },
    });
  }
}

function notFound() {
  return new NotFoundException({
    code: 'INVITATION_NOT_FOUND',
    message: 'This invitation link is not valid.',
  });
}

function invitationUsed() {
  return new GoneException({
    code: 'INVITATION_USED',
    message: 'This invitation has already been used or withdrawn.',
  });
}
