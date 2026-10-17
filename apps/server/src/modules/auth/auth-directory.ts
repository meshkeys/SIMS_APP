import { Injectable } from '@nestjs/common';
import type {
  MembershipStatus,
  OrganisationStatus,
  Role,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/index.js';

/** A workspace the user belongs to, as seen before any tenant is selected. */
export interface WorkspaceMembership {
  membershipId: string;
  organisationId: string;
  organisationSlug: string;
  organisationName: string;
  organisationStatus: OrganisationStatus;
  roles: Role[];
  membershipStatus: MembershipStatus;
  /** Can the user sign in to this workspace right now? */
  usable: boolean;
}

interface MembershipRow {
  membership_id: string;
  organisation_id: string;
  organisation_slug: string;
  organisation_name: string;
  organisation_status: OrganisationStatus;
  roles: Role[];
  membership_status: MembershipStatus;
}

const SIGN_IN_ALLOWED: readonly OrganisationStatus[] = ['ACTIVE', 'ONBOARDING'];

/**
 * The only cross-tenant reads in the API, used before a tenant is chosen
 * (sign-in, refresh, switching workspace). Users are global, and memberships
 * are read through the `sims_auth_memberships` SECURITY DEFINER function,
 * which returns one user's rows only.
 */
@Injectable()
export class AuthDirectory {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async membershipsOf(userId: string): Promise<WorkspaceMembership[]> {
    // Cast enum[] to text[] so the driver returns a JS array.
    const rows = await this.prisma.$queryRaw<MembershipRow[]>`
      SELECT membership_id, organisation_id, organisation_slug, organisation_name,
             organisation_status, roles::text[] AS roles, membership_status
      FROM sims_auth_memberships(${userId}::uuid)`;
    return rows.map((row) => ({
      membershipId: row.membership_id,
      organisationId: row.organisation_id,
      organisationSlug: row.organisation_slug,
      organisationName: row.organisation_name,
      organisationStatus: row.organisation_status,
      roles: row.roles,
      membershipStatus: row.membership_status,
      usable:
        row.membership_status === 'ACTIVE' &&
        SIGN_IN_ALLOWED.includes(row.organisation_status),
    }));
  }
}
