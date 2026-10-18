import { Module } from '@nestjs/common';
import { DeliveryModule } from '../delivery/delivery.module.js';
import { GovernanceModule } from '../governance/governance.module.js';
import { StrategyModule } from '../strategy/strategy.module.js';
import { PeriodsService } from './periods.service.js';
import { ReportingController } from './reporting.controller.js';
import { UpdatesService } from './updates.service.js';

/** The reporting cycle: periods, monthly updates, verification, approval, locking. */
@Module({
  imports: [StrategyModule, DeliveryModule, GovernanceModule],
  controllers: [ReportingController],
  providers: [PeriodsService, UpdatesService],
})
export class ReportingModule {}
