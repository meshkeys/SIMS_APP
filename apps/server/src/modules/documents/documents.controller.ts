import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { type AuthContext, CurrentAuth } from '../auth/index.js';
import { DocumentsService, type IncomingFile } from './documents.service.js';
import { SingleFileUploadInterceptor } from './single-file-upload.interceptor.js';
import { type DocumentView, idSchema } from '@sims/contracts';

const id = new ZodValidationPipe(idSchema);

/** "Q3 report.pdf" → a Content-Disposition that is safe for any file name. */
export function attachment(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Evidence on milestones: list, upload, download, remove. */
@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('milestones/:id/documents')
  list(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) milestoneId: string,
  ): Promise<DocumentView[]> {
    return this.documents.listForMilestone(caller, milestoneId);
  }

  /** Multipart, one file in the field "file". */
  @Post('milestones/:id/documents')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(SingleFileUploadInterceptor)
  upload(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) milestoneId: string,
    @UploadedFile() file: IncomingFile | undefined,
  ): Promise<DocumentView> {
    return this.documents.uploadToMilestone(caller, milestoneId, file);
  }

  /** Always an attachment, never rendered inline by the browser. */
  @Get('documents/:id/download')
  async download(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) documentId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.documents.download(caller, documentId);
    response.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    });
    return new StreamableFile(file.stream, {
      type: file.mimeType,
      disposition: attachment(file.fileName),
      length: file.sizeBytes,
    });
  }

  @Delete('documents/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) documentId: string,
  ): Promise<void> {
    return this.documents.remove(caller, documentId);
  }
}
