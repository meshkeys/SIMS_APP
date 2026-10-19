import { Injectable } from '@nestjs/common';
import type { Department, MemberPage, MemberQuery } from '@sims/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../infrastructure/database/index.js';

/**
 * The people directory and departments, for pickers and filters. Row-level
 * security keeps every query inside the caller's organisation.
 */
@Injectable()
export class PeopleService {
  constructor(private readonly db: TenantPrismaService) {}

  /** Active members, by name; search matches name, email or job title. */
  async members(query: MemberQuery): Promise<MemberPage> {
    const where: Prisma.MembershipWhereInput = {
      status: 'ACTIVE',
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
    const [total, rows] = await Promise.all([
      this.db.client.membership.count({ where }),
      this.db.client.membership.findMany({
        where,
        select: {
          id: true,
          jobTitle: true,
          roles: true,
          user: { select: { name: true, email: true } },
          department: { select: { id: true, name: true } },
        },
        orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => ({
        membershipId: row.id,
        name: row.user.name,
        email: row.user.email,
        jobTitle: row.jobTitle,
        department: row.department,
        roles: row.roles,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /** Every department, by name, with how many active members it has. */
  async departments(): Promise<Department[]> {
    const rows = await this.db.client.department.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        parentId: true,
        _count: { select: { members: { where: { status: 'ACTIVE' } } } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(({ _count, ...department }) => ({
      ...department,
      memberCount: _count.members,
    }));
  }
}
