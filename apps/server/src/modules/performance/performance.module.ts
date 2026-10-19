import { Module } from '@nestjs/common';
import { StrategyModule } from '../strategy/strategy.module.js';
import { PerformanceController } from './performance.controller.js';
import { PerformanceService } from './performance.service.js';

/** Read model for the KPIs & benefits realisation page. */
@Module({
  imports: [StrategyModule],
  controllers: [PerformanceController],
  providers: [PerformanceService],
})
export class PerformanceModule {}
