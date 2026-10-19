import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  canEditMember,
  deactivationProblem,
  type MemberRuleProblem,
  roleChangeProblem,
} from '../../domain/admin/member-rules.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { MembershipStatus } from '../../generated/prisma/enums.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import type { AuthContext } from '../auth/index.js';
import {
  assertDepartmentExists,
  invalidField,
} from '../delivery/write-access.js';
import {
  assertActiveMembers,
  personSelect,
  toPersonRef,
} from '../people/person.js';
import type {
  MemberAdmin,
  MemberAdminPage,
  MemberAdminQuery,
  UpdateMemberInput,
} from '@sims/contracts';

const memberInclude = {
  user: { select: { name: true, email: true } },
  department: { select: { id: true, name: true } },
  manager: personSelect,
} as const;
type MemberRow = Prisma.MembershipGetPayload<{ include: typeof memberInclude }>;

/** Initiatives that still need their owner or sponsor. */
const LIVE_STATUSES = [
  'DRAFT',
  'PROPOSED',
  'APPROVED',
  'ACTIVE',
  'ON_HOLD',
] as const;

const memberNotFound = () =>
  new NotFoundException({
    code: 'MEMBER_NOT_FOUND',
    message: 'Member not found.',
  });

function refuse(problem: MemberRuleProblem): never {
  if (problem.code === 'ADMIN_ONLY')
    throw new ForbiddenException({
      code: problem.code,
      message: problem.message,
    });
  throw new ConflictException({ code: problem.code, message: problem.message });
}

/**
 * Managing who has access and with which roles. Invitations add people;
 * this changes roles and details, and deactivates or restores access.
 * Deactivated members keep their history; their sessions end at the next
 * refresh, which re-checks membership.
 */
@Injectable()
export class MembersAdminService {
  constructor(private readonly db: TenantPrismaService) {}

  async list(
    viewer: AuthContext,
    query: MemberAdminQuery,
  ): Promise<MemberAdminPage> {
    const statuses: MembershipStatus[] = query.status ?? ['ACTIVE', 'INVITED'];
    const base: Prisma.MembershipWhereInput = {
      ...(query.role ? { roles: { has: query.role } } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.q
        ? {
            OR: [
              { user: { name: { contains: query.q, mode: 'insensitive' } } },
              { user: { email: { contains: query.q, mode: 'insensitive' } } },
              { jobTitle: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.db.transaction(async (tx) => {
      const where = { ...base, status: { in: statuses } };
      const total = await tx.membership.count({ where });
      const rows = await tx.membership.findMany({
        where,
        include: memberInclude,
        orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
      const byStatus = await tx.membership.groupBy({
        by: ['status'],
        where: base,
        _count: { _all: true },
      });
      const counts = { ACTIVE: 0, INVITED: 0, DEACTIVATED: 0 };
      for (const row of byStatus) counts[row.status] = row._count._all;
      return {
        items: await this.toViews(tx, viewer, rows),
        page: query.page,
        pageSize: query.pageSize,
        total,
        counts,
      };
    });
  }

  async update(
    caller: AuthContext,
    membershipId: string,
    input: UpdateMemberInput,
  ): Promise<MemberAdmin> {
    await this.db.transaction(async (tx) => {
      const target = await this.find(tx, membershipId);
      if (!canEditMember(caller, target)) {
        refuse({
          code: 'ADMIN_ONLY',
          message: 'Only a system administrator can change an administrator.',
        });
      }
      if (input.roles) {
        const problem = roleChangeProblem(
          caller,
          target,
          input.roles,
          await this.activeAdmins(tx),
        );
        if (problem) refuse(problem);
      }
      await assertDepartmentExists(tx, input.departmentId);
      if (input.managerId === membershipId) {
        throw invalidField('managerId', 'Someone cannot be their own manager');
      }
      await assertActiveMembers(tx, { managerId: input.managerId });

      await tx.membership.update({ where: { id: membershipId }, data: input });
      await recordAudit(tx, {
        action: 'MEMBER_UPDATED',
        entityType: 'Membership',
        entityId: membershipId,
        before: Object.fromEntries(
          Object.keys(input).map((key) => [
            key,
            target[key as keyof typeof target],
          ]),
        ),
        after: input,
      });
    });
    return this.view(caller, membershipId);
  }

  async deactivate(
    caller: AuthContext,
    membershipId: string,
  ): Promise<MemberAdmin> {
    await this.db.transaction(async (tx) => {
      const target = await this.find(tx, membershipId);
      if (target.status === 'DEACTIVATED') {
        throw new ConflictException({
          code: 'ALREADY_DEACTIVATED',
          message: `${target.user.name} is already deactivated.`,
        });
      }
      const problem = deactivationProblem(
        caller,
        target,
        await this.activeAdmins(tx),
      );
      if (problem) refuse(problem);
      await tx.membership.update({
        where: { id: membershipId },
        data: { status: 'DEACTIVATED' },
      });
      await recordAudit(tx, {
        action: 'MEMBER_DEACTIVATED',
        entityType: 'Membership',
        entityId: membershipId,
        before: { status: target.status, roles: target.roles },
      });
    });
    return this.view(caller, membershipId);
  }

  async reactivate(
    caller: AuthContext,
    membershipId: string,
  ): Promise<MemberAdmin> {
    await this.db.transaction(async (tx) => {
      const target = await this.find(tx, membershipId);
      if (target.status !== 'DEACTIVATED') {
        throw new ConflictException({
          code: 'NOT_DEACTIVATED',
          message: `${target.user.name} is not deactivated.`,
        });
      }
      if (!canEditMember(caller, target)) {
        refuse({
          code: 'ADMIN_ONLY',
          message: 'Only a system administrator can restore an administrator.',
        });
      }
      await tx.membership.update({
        where: { id: membershipId },
        data: { status: 'ACTIVE' },
      });
      await recordAudit(tx, {
        action: 'MEMBER_REACTIVATED',
        entityType: 'Membership',
        entityId: membershipId,
        after: { roles: target.roles },
      });
    });
    return this.view(caller, membershipId);
  }

  // ---------------------------------------------------------------------------

  private async view(
    viewer: AuthContext,
    membershipId: string,
  ): Promise<MemberAdmin> {
    return this.db.transaction(async (tx) => {
      const row = await tx.membership.findUnique({
        where: { id: membershipId },
        include: memberInclude,
      });
      if (!row) throw memberNotFound();
      return (await this.toViews(tx, viewer, [row]))[0]!;
    });
  }

  private async find(tx: TenantTransactionClient, membershipId: string) {
    const row = await tx.membership.findUnique({
      where: { id: membershipId },
      include: { user: { select: { name: true } } },
    });
    if (!row) throw memberNotFound();
    return { ...row, membershipId: row.id };
  }

  private activeAdmins(tx: TenantTransactionClient) {
    return tx.membership.count({
      where: { status: 'ACTIVE', roles: { has: 'SYSTEM_ADMIN' } },
    });
  }

  private async toViews(
    tx: TenantTransactionClient,
    viewer: AuthContext,
    rows: MemberRow[],
  ): Promise<MemberAdmin[]> {
    const ids = rows.map((r) => r.id);
    const owns = await tx.initiative.groupBy({
      by: ['ownerId'],
      where: { ownerId: { in: ids }, status: { in: [...LIVE_STATUSES] } },
      _count: { _all: true },
    });
    const sponsors = await tx.initiative.groupBy({
      by: ['sponsorId'],
      where: { sponsorId: { in: ids }, status: { in: [...LIVE_STATUSES] } },
      _count: { _all: true },
    });
    const decisions = await tx.decision.groupBy({
      by: ['requiredFromId'],
      where: { requiredFromId: { in: ids }, outcome: 'PENDING' },
      _count: { _all: true },
    });
    const activeAdmins = await this.activeAdmins(tx);
    const caller = { membershipId: viewer.membershipId, roles: viewer.roles };

    return rows.map((row) => {
      const target = {
        membershipId: row.id,
        roles: row.roles,
        status: row.status,
      };
      const editable = canEditMember(caller, target);
      return {
        membershipId: row.id,
        name: row.user.name,
        email: row.user.email,
        jobTitle: row.jobTitle,
        department: row.department,
        manager: toPersonRef(row.manager),
        roles: row.roles,
        status: row.status,
        joinedAt: row.joinedAt?.toISOString() ?? null,
        responsibilities: {
          owns: owns.find((o) => o.ownerId === row.id)?._count._all ?? 0,
          sponsors:
            sponsors.find((s) => s.sponsorId === row.id)?._count._all ?? 0,
          decisionsPending:
            decisions.find((d) => d.requiredFromId === row.id)?._count._all ??
            0,
        },
        can: {
          edit: editable && row.status !== 'DEACTIVATED',
          deactivate:
            row.status !== 'DEACTIVATED' &&
            deactivationProblem(caller, target, activeAdmins) === null,
          reactivate: row.status === 'DEACTIVATED' && editable,
        },
      };
    });
  }
}
