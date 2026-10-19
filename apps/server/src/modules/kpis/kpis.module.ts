import { Module } from '@nestjs/common';
import { StrategyModule } from '../strategy/strategy.module.js';
import { KpiActualsService } from './kpi-actuals.service.js';
import { KpiActualsController, KpisController } from './kpis.controller.js';
import { KpisService } from './kpis.service.js';

@Module({
  imports: [StrategyModule],
  controllers: [KpisController, KpiActualsController],
  providers: [KpisService, KpiActualsService],
})
export class KpisModule {}
