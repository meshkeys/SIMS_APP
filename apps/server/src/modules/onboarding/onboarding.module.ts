import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { StrategyModule } from '../strategy/strategy.module.js';
import { CustomFieldsService } from './custom-fields.service.js';
import { OnboardingController } from './onboarding.controller.js';
import { OnboardingService } from './onboarding.service.js';

/** Workspace set-up after sign-up, and the organisation's custom fields. */
@Module({
  imports: [AdminModule, StrategyModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, CustomFieldsService],
})
export class OnboardingModule {}
