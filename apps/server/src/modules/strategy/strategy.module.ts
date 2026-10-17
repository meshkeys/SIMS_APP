import { Module } from '@nestjs/common';
import { ElementsController } from './elements.controller.js';
import { ElementsService } from './elements.service.js';
import { FrameworkTemplatesController } from './framework-templates.controller.js';
import { PlansController } from './plans.controller.js';
import { PlansService } from './plans.service.js';
import { StrategyMapService } from './strategy-map.service.js';

/** Strategic plans, their configurable framework levels, and the strategy tree. */
@Module({
  controllers: [
    PlansController,
    ElementsController,
    FrameworkTemplatesController,
  ],
  providers: [PlansService, ElementsService, StrategyMapService],
  exports: [PlansService],
})
export class StrategyModule {}
