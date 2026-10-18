import { Module } from '@nestjs/common';
import { ApiDocsController } from './api-docs.controller.js';

/** OpenAPI document and interactive reference, generated from @sims/contracts. */
@Module({ controllers: [ApiDocsController] })
export class ApiDocsModule {}
