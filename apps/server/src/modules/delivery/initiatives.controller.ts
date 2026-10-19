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
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { PROPOSER_ROLES } from '../../domain/delivery/permissions.js';
import { STRATEGY_EDITOR_ROLES } from '../../domain/roles/roles.js';
import { type AuthContext, CurrentAuth, Roles } from '../auth/index.js';
import { HealthRecalculationService } from './health-recalculation.service.js';
import { InitiativeRegisterService } from './initiative-register.service.js';
import { InitiativeWritesService } from './initiative-writes.service.js';
import { InitiativesService } from './initiatives.service.js';
import { RegisterExportService } from './register-export.service.js';
import { WorkItemsService } from './work-items.service.js';
import {
  type CreateDependencyInput,
  createDependencySchema,
  type CreateInitiativeInput,
  createInitiativeSchema,
  type CreateMilestoneInput,
  createMilestoneSchema,
  idSchema,
  type InitiativeDetail,
  type ObjectivesInput,
  objectivesSchema,
  type OverrideInput,
  overrideSchema,
  type RecalculationSummary,
  type RegisterPage,
  type RegisterExportQuery,
  registerExportQuerySchema,
  type RegisterQuery,
  XLSX_MEDIA_TYPE,
  registerQuerySchema,
  type StatusChangeInput,
  statusChangeSchema,
  type UpdateInitiativeInput,
  updateInitiativeSchema,
} from '@sims/contracts';

const id = new ZodValidationPipe(idSchema);

@Controller('initiatives')
export class InitiativesController {
  constructor(
    private readonly register: InitiativeRegisterService,
    private readonly initiatives: InitiativesService,
    private readonly recalculation: HealthRecalculationService,
    private readonly writes: InitiativeWritesService,
    private readonly work: WorkItemsService,
    private readonly exporter: RegisterExportService,
  ) {}

  /** Propose an initiative (or, for the Strategy Office, save a draft). */
  @Roles(...PROPOSER_ROLES)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentAuth() caller: AuthContext,
    @Body(new ZodValidationPipe(createInitiativeSchema))
    input: CreateInitiativeInput,
  ): Promise<InitiativeDetail> {
    return this.writes.create(caller, input);
  }

  /** The Initiative register: tabs, health chips, filters, sorting and pages. */
  @Get()
  list(
    @CurrentAuth() caller: AuthContext,
    @Query(new ZodValidationPipe(registerQuerySchema)) query: RegisterQuery,
  ): Promise<RegisterPage> {
    return this.register.list(caller, query);
  }

  /**
   * Recalculate progress and health for every active initiative now (also
   * runs automatically after changes and, with the jobs module, nightly).
   */
  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post('recalculate')
  @HttpCode(HttpStatus.OK)
  recalculate(): Promise<RecalculationSummary> {
    return this.recalculation.recalculateAll();
  }

  /**
   * The register as an Excel workbook, with the screen's filters. Declared
   * before ':id' so "export" is never read as an initiative id.
   */
  @Get('export')
  async export(
    @CurrentAuth() viewer: AuthContext,
    @Query(new ZodValidationPipe(registerExportQuerySchema))
    query: RegisterExportQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.exporter.export(viewer, query);
    response.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(file.content, {
      type: XLSX_MEDIA_TYPE,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.content.length,
    });
  }

  /** Everything the Initiative detail screen shows. */
  @Get(':id')
  detail(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) initiativeId: string,
  ): Promise<InitiativeDetail> {
    return this.initiatives.detail(caller, initiativeId);
  }

  /** Edit details; who may change which fields depends on their relation to it. */
  @Patch(':id')
  update(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) initiativeId: string,
    @Body(new ZodValidationPipe(updateInitiativeSchema))
    input: UpdateInitiativeInput,
  ): Promise<InitiativeDetail> {
    return this.writes.update(caller, initiativeId, input);
  }

  /** Replace the objectives it contributes to (Strategy Office). */
  @Put(':id/objectives')
  replaceObjectives(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) initiativeId: string,
    @Body(new ZodValidationPipe(objectivesSchema)) input: ObjectivesInput,
  ): Promise<InitiativeDetail> {
    return this.writes.replaceObjectives(caller, initiativeId, input);
  }

  /** Move through the lifecycle (Strategy Office). */
  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  changeStatus(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) initiativeId: string,
    @Body(new ZodValidationPipe(statusChangeSchema)) input: StatusChangeInput,
  ): Promise<InitiativeDetail> {
    return this.writes.changeStatus(caller, initiativeId, input);
  }

  @Post(':id/milestones')
  @HttpCode(HttpStatus.CREATED)
  addMilestone(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) initiativeId: string,
    @Body(new ZodValidationPipe(createMilestoneSchema))
    input: CreateMilestoneInput,
  ): Promise<InitiativeDetail> {
    return this.work.addMilestone(caller, initiativeId, input);
  }

  /** Record that this initiative waits on another. */
  @Post(':id/dependencies')
  @HttpCode(HttpStatus.CREATED)
  addDependency(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) initiativeId: string,
    @Body(new ZodValidationPipe(createDependencySchema))
    input: CreateDependencyInput,
  ): Promise<InitiativeDetail> {
    return this.work.addDependency(caller, initiativeId, input);
  }

  /** Override the calculated status (reason and expiry required; permission from the ruleset). */
  @Put(':id/override')
  setOverride(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) initiativeId: string,
    @Body(new ZodValidationPipe(overrideSchema)) input: OverrideInput,
  ): Promise<InitiativeDetail> {
    return this.initiatives.setOverride(caller, initiativeId, input);
  }

  @Delete(':id/override')
  clearOverride(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) initiativeId: string,
  ): Promise<InitiativeDetail> {
    return this.initiatives.clearOverride(caller, initiativeId);
  }
}
