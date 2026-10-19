import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { STRATEGY_EDITOR_ROLES } from '../../domain/roles/roles.js';
import { type AuthContext, CurrentAuth, Roles } from '../auth/index.js';
import { ReportsService } from './reports.service.js';
import {
  type CreatePackInput,
  createPackSchema,
  idSchema,
  type PackContent,
  type PackDefinition,
  packDefinitionSchema,
  REPORT_READER_ROLES,
  type ReportPack,
  type ReportSnapshot,
} from '@sims/contracts';

const id = new ZodValidationPipe(idSchema);

/** Board packs and management reports, built from locked cycle snapshots. */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Get('snapshots')
  snapshots(): Promise<ReportSnapshot[]> {
    return this.reports.snapshots();
  }

  /** The content a pack would contain, without saving anything. */
  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @Body(new ZodValidationPipe(packDefinitionSchema))
    definition: PackDefinition,
  ): Promise<PackContent> {
    return this.reports.preview(definition);
  }

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post('packs')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentAuth() caller: AuthContext,
    @Body(new ZodValidationPipe(createPackSchema)) input: CreatePackInput,
  ): Promise<ReportPack> {
    return this.reports.create(caller, input);
  }

  @Roles(...REPORT_READER_ROLES)
  @Get('packs')
  list(@CurrentAuth() caller: AuthContext): Promise<ReportPack[]> {
    return this.reports.list(caller);
  }

  @Roles(...REPORT_READER_ROLES)
  @Get('packs/:id')
  get(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) packId: string,
  ): Promise<ReportPack> {
    return this.reports.get(caller, packId);
  }
}
