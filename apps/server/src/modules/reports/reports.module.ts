import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/** Report packs: templates, snapshots, preview and pack requests. */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
