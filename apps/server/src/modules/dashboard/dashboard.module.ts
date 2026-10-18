import { Module } from '@nestjs/common';
import { DeliveryModule } from '../delivery/delivery.module.js';
import { GovernanceModule } from '../governance/governance.module.js';
import { ReportingModule } from '../reporting/reporting.module.js';
import { StrategyModule } from '../strategy/strategy.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

/** Read model for the Strategy Execution Command Centre. */
@Module({
  imports: [StrategyModule, DeliveryModule, ReportingModule, GovernanceModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
