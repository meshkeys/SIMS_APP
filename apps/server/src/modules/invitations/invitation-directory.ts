import { Injectable } from '@nestjs/common';
import { hashSecureToken } from '../../common/crypto/secure-token.js';
import type { OrganisationStatus, Role } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../infrastructure/database/index.js';

/** An invitation as seen from the public accept page, before any tenant is known. */
export interface InvitationByToken {
  invitationId: string;
  organisationId: string;
  organisationName: string;
  organisationStatus: OrganisationStatus;
  email: string;
  roles: Role[];
  jobTitle: string | null;
  departmentId: string | null;
  invitedByName: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

interface Row {
  invitation_id: string;
  organisation_id: string;
  organisation_name: string;
  organisation_status: OrganisationStatus;
  email: string;
  roles: Role[];
  job_title: string | null;
  department_id: string | null;
  invited_by_name: string;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
}

/**
 * Finds an invitation by its secret token through the
 * `sims_invitation_by_token_hash` SECURITY DEFINER function — the only way
 * to read an invitation without a tenant context.
 */
@Injectable()
export class InvitationDirectory {
  constructor(private readonly prisma: PrismaService) {}

  async findByToken(token: string): Promise<InvitationByToken | undefined> {
    const [row] = await this.prisma.$queryRaw<Row[]>`
      SELECT * FROM sims_invitation_by_token_hash(${hashSecureToken(token)})`;
    if (!row) return undefined;
    return {
      invitationId: row.invitation_id,
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      organisationStatus: row.organisation_status,
      email: row.email,
      roles: row.roles,
      jobTitle: row.job_title,
      departmentId: row.department_id,
      invitedByName: row.invited_by_name,
      expiresAt: new Date(row.expires_at),
      acceptedAt: row.accepted_at ? new Date(row.accepted_at) : null,
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    };
  }
}
