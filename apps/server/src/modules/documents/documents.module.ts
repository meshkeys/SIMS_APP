import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { SingleFileUploadInterceptor } from './single-file-upload.interceptor.js';

/** Documents and evidence, stored through the object storage (see infrastructure/storage). */
@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, SingleFileUploadInterceptor],
})
export class DocumentsModule {}
