import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AuditLogService } from './audit-log.service.js';
import { DepartmentsAdminService } from './departments-admin.service.js';
import { MembersAdminService } from './members-admin.service.js';
import { OrganisationService } from './organisation.service.js';

/** Administration: members and roles, departments, organisation settings, audit log. */
@Module({
  controllers: [AdminController],
  providers: [
    MembersAdminService,
    DepartmentsAdminService,
    OrganisationService,
    AuditLogService,
  ],
})
export class AdminModule {}
