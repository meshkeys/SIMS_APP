import { Module } from '@nestjs/common';
import { DeliveryModule } from '../delivery/delivery.module.js';
import { ChangeRequestsService } from './change-requests.service.js';
import { DecisionsService } from './decisions.service.js';
import { GovernanceController } from './governance.controller.js';
import { RisksService } from './risks.service.js';

/** Risks and issues, decisions, and maker-checker change requests. */
@Module({
  imports: [DeliveryModule],
  controllers: [GovernanceController],
  providers: [RisksService, DecisionsService, ChangeRequestsService],
  exports: [DecisionsService],
})
export class GovernanceModule {}
