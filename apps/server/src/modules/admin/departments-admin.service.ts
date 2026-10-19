import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation } from '../../common/data/prisma-errors.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import { wouldCreateCycle } from '../../domain/admin/member-rules.js';
import { recordAudit } from '../../infrastructure/audit/record-audit.js';
import {
  TenantContext,
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../infrastructure/database/index.js';
import { invalidField } from '../delivery/write-access.js';
import type {
  CreateDepartmentInput,
  Department,
  UpdateDepartmentInput,
} from '@sims/contracts';

const departmentNotFound = () =>
  new NotFoundException({
    code: 'DEPARTMENT_NOT_FOUND',
    message: 'Department not found.',
  });
const nameTaken = (name: string) =>
  new ConflictException({
    code: 'NAME_TAKEN',
    message: `There is already a department called ${name}.`,
  });

/** Departments: create, rename, nest, and delete empty ones. */
@Injectable()
export class DepartmentsAdminService {
  constructor(private readonly db: TenantPrismaService) {}

  async create(input: CreateDepartmentInput): Promise<Department> {
    const id = uuidv7();
    try {
      await this.db.transaction(async (tx) => {
        await this.assertParent(tx, input.parentId);
        await tx.department.create({
          data: {
            id,
            organisationId: TenantContext.require().organisationId,
            name: input.name,
            code: input.code,
            parentId: input.parentId,
          },
        });
        await recordAudit(tx, {
          action: 'DEPARTMENT_CREATED',
          entityType: 'Department',
          entityId: id,
          after: input,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error, 'name')) throw nameTaken(input.name);
      throw error;
    }
    return this.get(id);
  }

  async update(
    departmentId: string,
    input: UpdateDepartmentInput,
  ): Promise<Department> {
    try {
      await this.db.transaction(async (tx) => {
        const current = await tx.department.findUnique({
          where: { id: departmentId },
        });
        if (!current) throw departmentNotFound();
        if (input.parentId !== undefined) {
          await this.assertParent(tx, input.parentId);
          const all = await tx.department.findMany({
            select: { id: true, parentId: true },
          });
          if (wouldCreateCycle(all, departmentId, input.parentId)) {
            throw invalidField(
              'parentId',
              'A department cannot sit inside itself',
            );
          }
        }
        await tx.department.update({
          where: { id: departmentId },
          data: input,
        });
        await recordAudit(tx, {
          action: 'DEPARTMENT_UPDATED',
          entityType: 'Department',
          entityId: departmentId,
          before: Object.fromEntries(
            Object.keys(input).map((k) => [
              k,
              current[k as keyof typeof current],
            ]),
          ),
          after: input,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error, 'name')) throw nameTaken(input.name ?? '');
      throw error;
    }
    return this.get(departmentId);
  }

  /** Only an empty department: no people (in any status), initiatives or sub-departments. */
  async remove(departmentId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const department = await tx.department.findUnique({
        where: { id: departmentId },
        select: {
          name: true,
          _count: {
            select: { members: true, initiatives: true, children: true },
          },
        },
      });
      if (!department) throw departmentNotFound();
      const { members, initiatives, children } = department._count;
      if (members + initiatives + children > 0) {
        const parts = [
          members && `${members} member${members === 1 ? '' : 's'}`,
          initiatives &&
            `${initiatives} initiative${initiatives === 1 ? '' : 's'}`,
          children && `${children} sub-department${children === 1 ? '' : 's'}`,
        ].filter(Boolean);
        throw new ConflictException({
          code: 'DEPARTMENT_IN_USE',
          message: `${department.name} still has ${parts.join(', ')}. Move them first.`,
        });
      }
      await tx.department.delete({ where: { id: departmentId } });
      await recordAudit(tx, {
        action: 'DEPARTMENT_DELETED',
        entityType: 'Department',
        entityId: departmentId,
        before: { name: department.name },
      });
    });
  }

  private async get(departmentId: string): Promise<Department> {
    const row = await this.db.client.department.findUnique({
      where: { id: departmentId },
      select: {
        id: true,
        name: true,
        code: true,
        parentId: true,
        _count: { select: { members: { where: { status: 'ACTIVE' } } } },
      },
    });
    if (!row) throw departmentNotFound();
    const { _count, ...department } = row;
    return { ...department, memberCount: _count.members };
  }

  private async assertParent(
    tx: TenantTransactionClient,
    parentId: string | null | undefined,
  ) {
    if (!parentId) return;
    const parent = await tx.department.findUnique({
      where: { id: parentId },
      select: { id: true },
    });
    if (!parent)
      throw invalidField(
        'parentId',
        'Choose a department of your organisation',
      );
  }
}
