import { Module } from '@nestjs/common';
import { PackGeneratorService } from './pack-generator.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/** Report packs: snapshots, preview, requests, generation (as jobs) and downloads. */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService, PackGeneratorService],
})
export class ReportsModule {}
