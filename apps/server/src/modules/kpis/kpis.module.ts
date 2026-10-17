import { Module } from '@nestjs/common';
import { StrategyModule } from '../strategy/strategy.module.js';
import { KpisController } from './kpis.controller.js';
import { KpisService } from './kpis.service.js';

@Module({
  imports: [StrategyModule],
  controllers: [KpisController],
  providers: [KpisService],
})
export class KpisModule {}
