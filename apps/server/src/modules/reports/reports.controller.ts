import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { STRATEGY_EDITOR_ROLES } from '../../domain/roles/roles.js';
import { type AuthContext, CurrentAuth, Roles } from '../auth/index.js';
import { attachment } from '../documents/documents.controller.js';
import { ReportsService } from './reports.service.js';
import {
  type CreatePackInput,
  createPackSchema,
  idSchema,
  type PackContent,
  type PackDefinition,
  packDefinitionSchema,
  type PackDownloadQuery,
  packDownloadQuerySchema,
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

  /** Always an attachment; the file name carries the title and version. */
  @Roles(...REPORT_READER_ROLES)
  @Get('packs/:id/download')
  async download(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) packId: string,
    @Query(new ZodValidationPipe(packDownloadQuerySchema))
    query: PackDownloadQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.reports.download(caller, packId, query.format);
    response.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(file.stream, {
      type: file.mimeType,
      disposition: attachment(file.fileName),
    });
  }

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post('packs/:id/regenerate')
  @HttpCode(HttpStatus.OK)
  regenerate(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) packId: string,
  ): Promise<ReportPack> {
    return this.reports.regenerate(caller, packId);
  }
}
