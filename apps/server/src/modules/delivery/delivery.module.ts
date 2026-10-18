import { Module } from '@nestjs/common';
import { StrategyModule } from '../strategy/strategy.module.js';
import { HealthRecalculationService } from './health-recalculation.service.js';
import { InitiativeRegisterService } from './initiative-register.service.js';
import { InitiativesController } from './initiatives.controller.js';
import { InitiativesService } from './initiatives.service.js';

/** Initiatives: register, detail, health recalculation and overrides. */
@Module({
  imports: [StrategyModule],
  controllers: [InitiativesController],
  providers: [
    InitiativeRegisterService,
    InitiativesService,
    HealthRecalculationService,
  ],
  exports: [HealthRecalculationService],
})
export class DeliveryModule {}
