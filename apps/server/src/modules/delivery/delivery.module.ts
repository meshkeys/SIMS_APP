import { Module } from '@nestjs/common';
import { StrategyModule } from '../strategy/strategy.module.js';
import { HealthRecalculationService } from './health-recalculation.service.js';
import { InitiativeRegisterService } from './initiative-register.service.js';
import { InitiativesController } from './initiatives.controller.js';
import { InitiativeWritesService } from './initiative-writes.service.js';
import { InitiativesService } from './initiatives.service.js';
import { WorkItemsController } from './work-items.controller.js';
import { WorkItemsService } from './work-items.service.js';

/** Initiatives, milestones, tasks and dependencies; health recalculation and overrides. */
@Module({
  imports: [StrategyModule],
  controllers: [InitiativesController, WorkItemsController],
  providers: [
    InitiativeRegisterService,
    InitiativesService,
    HealthRecalculationService,
    InitiativeWritesService,
    WorkItemsService,
  ],
  exports: [HealthRecalculationService, InitiativeRegisterService],
})
export class DeliveryModule {}
