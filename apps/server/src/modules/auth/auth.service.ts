import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { isUniqueViolation } from '../../common/data/prisma-errors.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { DEFAULT_RULESET_CONFIG } from '../../domain/rulesets/ruleset-config.js';
import type { Role } from '../../generated/prisma/enums.js';
import {
  PrismaService,
  TenantContext,
  TenantPrismaService,
} from '../../infrastructure/database/index.js';
import type { AuthContext } from './auth-context.js';
import { AuthDirectory, type WorkspaceMembership } from './auth-directory.js';
import {
  burnPasswordCheck,
  hashPassword,
  verifyPassword,
} from './passwords.js';
import {
  AccessTokenService,
  type IssuedAccessToken,
} from './tokens/access-token.service.js';
import {
  type ClientMeta,
  type IssuedRefreshToken,
  RefreshTokenService,
} from './tokens/refresh-token.service.js';
import type { LoginInput, SessionView, SignupInput } from '@sims/contracts';

export interface IssuedSession {
  view: SessionView;
  accessToken: IssuedAccessToken;
  refreshToken: IssuedRefreshToken;
}

const TRIAL_DAYS = 14;
/** The first user of a new organisation administers it and runs the Strategy Office. */
const FOUNDER_ROLES: Role[] = ['SYSTEM_ADMIN', 'STRATEGY_OFFICE'];

const invalidCredentials = () =>
  new UnauthorizedException({
    code: 'INVALID_CREDENTIALS',
    message: 'Email or password is incorrect.',
  });

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantPrismaService,
    private readonly directory: AuthDirectory,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  /** Creates a person, their organisation (on a trial) and a session in one go. */
  async signup(input: SignupInput, meta: ClientMeta): Promise<IssuedSession> {
    if (await this.directory.findUserByEmail(input.email)) throw emailTaken();
    const passwordHash = await hashPassword(input.password);

    const derived = !input.organisationSlug;
    let slug = input.organisationSlug ?? slugify(input.organisationName);
    for (let attempt = 0; ; attempt++) {
      try {
        const membership = await this.createOrganisation(
          input,
          slug,
          passwordHash,
          meta,
        );
        return this.startSession(membership.userId, membership.workspace, meta);
      } catch (error) {
        if (isUniqueViolation(error, 'email')) throw emailTaken();
        if (isUniqueViolation(error, 'slug')) {
          // A chosen address is the user's call; a derived one we can adjust.
          if (!derived || attempt >= 4) {
            throw new ConflictException({
              code: 'SLUG_TAKEN',
              message: 'That workspace address is taken. Choose another.',
            });
          }
          slug = `${slugify(input.organisationName).slice(0, 56)}-${randomSuffix()}`;
          continue;
        }
        throw error;
      }
    }
  }

  async login(input: LoginInput, meta: ClientMeta): Promise<IssuedSession> {
    const user = await this.directory.findUserByEmail(input.email);
    if (!user?.passwordHash) {
      await burnPasswordCheck(input.password);
      throw invalidCredentials();
    }
    if (!(await verifyPassword(user.passwordHash, input.password))) {
      throw invalidCredentials();
    }

    const memberships = (await this.directory.membershipsOf(user.id)).filter(
      (m) => m.usable,
    );
    const workspace = input.organisationSlug
      ? memberships.find((m) => m.organisationSlug === input.organisationSlug)
      : memberships[0];
    if (!workspace) {
      throw new ForbiddenException({
        code: 'NO_ACTIVE_MEMBERSHIP',
        message: input.organisationSlug
          ? 'You do not have access to that workspace.'
          : 'Your account is not active in any workspace. Contact your administrator.',
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit(workspace, 'USER_SIGNED_IN', user.id, meta);
    return this.startSession(user.id, workspace, meta);
  }

  /** Rotates the refresh token and re-checks that the membership is still active. */
  async refresh(
    refreshToken: string,
    meta: ClientMeta,
  ): Promise<IssuedSession> {
    const rotated = await this.refreshTokens.rotate(refreshToken, meta);
    const workspace = await this.usableWorkspace(
      rotated.userId,
      rotated.organisationId,
    );
    if (!workspace) {
      await this.refreshTokens.revokeFamily(rotated.familyId);
      throw new UnauthorizedException({
        code: 'MEMBERSHIP_INACTIVE',
        message: 'Your access to this workspace has ended.',
      });
    }
    return this.issue(rotated.userId, workspace, rotated);
  }

  async switchOrganisation(
    auth: AuthContext,
    refreshToken: string,
    organisationId: string,
    meta: ClientMeta,
  ): Promise<IssuedSession> {
    const workspace = await this.usableWorkspace(auth.userId, organisationId);
    if (!workspace) {
      throw new ForbiddenException({
        code: 'NO_ACTIVE_MEMBERSHIP',
        message: 'You do not have access to that workspace.',
      });
    }
    const rotated = await this.refreshTokens.rotate(
      refreshToken,
      meta,
      organisationId,
    );
    if (rotated.userId !== auth.userId) {
      await this.refreshTokens.revokeFamily(rotated.familyId);
      throw new UnauthorizedException({
        code: 'SESSION_MISMATCH',
        message: 'Please sign in again.',
      });
    }
    return this.issue(auth.userId, workspace, rotated);
  }

  /**
   * Starts a session for a user who was just authenticated another way
   * (e.g. by accepting an emailed invitation).
   */
  async startSessionIn(
    userId: string,
    organisationId: string,
    meta: ClientMeta,
  ): Promise<IssuedSession> {
    const workspace = await this.usableWorkspace(userId, organisationId);
    if (!workspace) {
      throw new ForbiddenException({
        code: 'NO_ACTIVE_MEMBERSHIP',
        message: 'You do not have access to that workspace.',
      });
    }
    return this.startSession(userId, workspace, meta);
  }

  logout(refreshToken: string | undefined): Promise<void> {
    return refreshToken
      ? this.refreshTokens.revoke(refreshToken)
      : Promise.resolve();
  }

  async me(auth: AuthContext): Promise<SessionView> {
    const workspace = await this.usableWorkspace(
      auth.userId,
      auth.organisationId,
    );
    if (!workspace) {
      throw new UnauthorizedException({
        code: 'MEMBERSHIP_INACTIVE',
        message: 'Your access to this workspace has ended.',
      });
    }
    return this.view(auth.userId, workspace);
  }

  // ---------------------------------------------------------------------------

  private async createOrganisation(
    input: SignupInput,
    slug: string,
    passwordHash: string,
    meta: ClientMeta,
  ): Promise<{ userId: string; workspace: WorkspaceMembership }> {
    const organisationId = uuidv7();
    const userId = uuidv7();
    const membershipId = uuidv7();
    const now = new Date();

    // The new organisation becomes the tenant context first, so every insert
    // below passes row-level security for it (and only it).
    await TenantContext.run({ organisationId }, () =>
      this.db.transaction(async (tx) => {
        await tx.user.create({
          data: {
            id: userId,
            email: input.email,
            name: input.name,
            passwordHash,
            lastLoginAt: now,
          },
        });
        await tx.organisation.create({
          data: {
            id: organisationId,
            name: input.organisationName,
            slug,
            sector: input.sector,
            country: input.country,
            currency: input.currency,
            timezone: input.timezone,
            status: 'ONBOARDING',
            onboardingStep: 1,
          },
        });
        await tx.subscription.create({
          data: {
            id: uuidv7(),
            organisationId,
            plan: 'TRIAL',
            status: 'TRIALING',
            trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 86_400_000),
          },
        });
        await tx.membership.create({
          data: {
            id: membershipId,
            organisationId,
            userId,
            roles: FOUNDER_ROLES,
            jobTitle: input.jobTitle,
            status: 'ACTIVE',
            joinedAt: now,
          },
        });
        // Every organisation starts with editable default rules (version 1).
        await tx.ruleset.create({
          data: {
            id: uuidv7(),
            organisationId,
            version: 1,
            status: 'ACTIVE',
            config: DEFAULT_RULESET_CONFIG,
            changeSummary: 'Default rules created at sign-up',
            proposedById: membershipId,
            approvedById: membershipId,
            effectiveFrom: now,
          },
        });
        await tx.auditEvent.create({
          data: {
            id: uuidv7(),
            organisationId,
            actorId: membershipId,
            action: 'ORGANISATION_CREATED',
            entityType: 'Organisation',
            entityId: organisationId,
            after: { name: input.organisationName, slug },
            ipAddress: meta.ipAddress,
          },
        });
      }),
    );

    return {
      userId,
      workspace: {
        membershipId,
        organisationId,
        organisationSlug: slug,
        organisationName: input.organisationName,
        organisationStatus: 'ONBOARDING',
        roles: FOUNDER_ROLES,
        membershipStatus: 'ACTIVE',
        usable: true,
      },
    };
  }

  private async usableWorkspace(
    userId: string,
    organisationId: string | null,
  ): Promise<WorkspaceMembership | undefined> {
    if (!organisationId) return undefined;
    const memberships = await this.directory.membershipsOf(userId);
    return memberships.find(
      (m) => m.usable && m.organisationId === organisationId,
    );
  }

  private async startSession(
    userId: string,
    workspace: WorkspaceMembership,
    meta: ClientMeta,
  ): Promise<IssuedSession> {
    const refreshToken = await this.refreshTokens.issue(
      userId,
      workspace.organisationId,
      meta,
    );
    return this.issue(userId, workspace, refreshToken);
  }

  private async issue(
    userId: string,
    workspace: WorkspaceMembership,
    refreshToken: IssuedRefreshToken,
  ): Promise<IssuedSession> {
    const accessToken = await this.accessTokens.issue({
      userId,
      organisationId: workspace.organisationId,
      membershipId: workspace.membershipId,
      roles: workspace.roles,
      sessionId: refreshToken.familyId,
    });
    return {
      view: await this.view(userId, workspace),
      accessToken,
      refreshToken,
    };
  }

  private async view(
    userId: string,
    workspace: WorkspaceMembership,
  ): Promise<SessionView> {
    const [user, membership, all] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      }),
      TenantContext.run({ organisationId: workspace.organisationId }, () =>
        this.db.client.membership.findUniqueOrThrow({
          where: { id: workspace.membershipId },
          select: {
            jobTitle: true,
            organisation: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                currency: true,
                timezone: true,
                terminology: true,
                onboardingStep: true,
              },
            },
          },
        }),
      ),
      this.directory.membershipsOf(userId),
    ]);

    return {
      user,
      organisation: membership.organisation,
      membership: {
        id: workspace.membershipId,
        roles: workspace.roles,
        jobTitle: membership.jobTitle,
      },
      organisations: all
        .filter((m) => m.usable)
        .map((m) => ({
          id: m.organisationId,
          name: m.organisationName,
          slug: m.organisationSlug,
          roles: m.roles,
        })),
    };
  }

  private audit(
    workspace: WorkspaceMembership,
    action: string,
    userId: string,
    meta: ClientMeta,
  ) {
    return TenantContext.run({ organisationId: workspace.organisationId }, () =>
      this.db.client.auditEvent.create({
        data: {
          id: uuidv7(),
          organisationId: workspace.organisationId,
          actorId: workspace.membershipId,
          action,
          entityType: 'User',
          entityId: userId,
          ipAddress: meta.ipAddress,
        },
      }),
    );
  }
}

// -----------------------------------------------------------------------------

function emailTaken() {
  return new ConflictException({
    code: 'EMAIL_TAKEN',
    message: 'An account with this email already exists. Sign in instead.',
  });
}

/** "Meridian Financial Group" → "meridian-financial-group" */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return slug.length >= 3 ? slug : `${slug || 'org'}-${randomSuffix()}`;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0');
}
