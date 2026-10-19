import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { INVITER_ROLES } from '../../domain/roles/roles.js';
import { type AuthContext, CurrentAuth, Roles } from '../auth/index.js';
import { AuditLogService } from './audit-log.service.js';
import { DepartmentsAdminService } from './departments-admin.service.js';
import { MembersAdminService } from './members-admin.service.js';
import { OrganisationService } from './organisation.service.js';
import {
  AUDIT_READER_ROLES,
  type AuditPage,
  type AuditQuery,
  auditQuerySchema,
  type CreateDepartmentInput,
  createDepartmentSchema,
  type Department,
  idSchema,
  type MemberAdmin,
  type MemberAdminPage,
  type MemberAdminQuery,
  memberAdminQuerySchema,
  type OrganisationSettings,
  type UpdateDepartmentInput,
  updateDepartmentSchema,
  type UpdateMemberInput,
  updateMemberSchema,
  type UpdateOrganisationInput,
  updateOrganisationSchema,
} from '@sims/contracts';

const id = new ZodValidationPipe(idSchema);

/** Administration: members and roles, departments, organisation settings, audit log. */
@Controller()
export class AdminController {
  constructor(
    private readonly members: MembersAdminService,
    private readonly departments: DepartmentsAdminService,
    private readonly organisation: OrganisationService,
    private readonly audit: AuditLogService,
  ) {}

  @Roles(...INVITER_ROLES)
  @Get('admin/members')
  listMembers(
    @CurrentAuth() caller: AuthContext,
    @Query(new ZodValidationPipe(memberAdminQuerySchema))
    query: MemberAdminQuery,
  ): Promise<MemberAdminPage> {
    return this.members.list(caller, query);
  }

  @Roles(...INVITER_ROLES)
  @Patch('admin/members/:id')
  updateMember(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) membershipId: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) input: UpdateMemberInput,
  ): Promise<MemberAdmin> {
    return this.members.update(caller, membershipId, input);
  }

  @Roles(...INVITER_ROLES)
  @Post('admin/members/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) membershipId: string,
  ): Promise<MemberAdmin> {
    return this.members.deactivate(caller, membershipId);
  }

  @Roles(...INVITER_ROLES)
  @Post('admin/members/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) membershipId: string,
  ): Promise<MemberAdmin> {
    return this.members.reactivate(caller, membershipId);
  }

  @Roles(...INVITER_ROLES)
  @Post('departments')
  @HttpCode(HttpStatus.CREATED)
  createDepartment(
    @Body(new ZodValidationPipe(createDepartmentSchema))
    input: CreateDepartmentInput,
  ): Promise<Department> {
    return this.departments.create(input);
  }

  @Roles(...INVITER_ROLES)
  @Patch('departments/:id')
  updateDepartment(
    @Param('id', id) departmentId: string,
    @Body(new ZodValidationPipe(updateDepartmentSchema))
    input: UpdateDepartmentInput,
  ): Promise<Department> {
    return this.departments.update(departmentId, input);
  }

  @Roles(...INVITER_ROLES)
  @Delete('departments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDepartment(@Param('id', id) departmentId: string): Promise<void> {
    return this.departments.remove(departmentId);
  }

  @Get('organisation')
  getOrganisation(): Promise<OrganisationSettings> {
    return this.organisation.get();
  }

  @Roles('SYSTEM_ADMIN')
  @Patch('organisation')
  updateOrganisation(
    @Body(new ZodValidationPipe(updateOrganisationSchema))
    input: UpdateOrganisationInput,
  ): Promise<OrganisationSettings> {
    return this.organisation.update(input);
  }

  @Roles(...AUDIT_READER_ROLES)
  @Get('audit')
  listAudit(
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQuery,
  ): Promise<AuditPage> {
    return this.audit.list(query);
  }
}
