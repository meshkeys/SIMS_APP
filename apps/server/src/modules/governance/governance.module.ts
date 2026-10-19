import { Module } from '@nestjs/common';
import { DeliveryModule } from '../delivery/delivery.module.js';
import { ChangeRequestsService } from './change-requests.service.js';
import { DecisionsService } from './decisions.service.js';
import { EscalationsController } from './escalations.controller.js';
import { EscalationsService } from './escalations.service.js';
import { GovernanceController } from './governance.controller.js';
import { RisksService } from './risks.service.js';

/** Risks and issues, escalations, decisions, and maker-checker change requests. */
@Module({
  imports: [DeliveryModule],
  controllers: [GovernanceController, EscalationsController],
  providers: [
    RisksService,
    DecisionsService,
    ChangeRequestsService,
    EscalationsService,
  ],
  exports: [DecisionsService, EscalationsService],
})
export class GovernanceModule {}
