import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { STRATEGY_EDITOR_ROLES } from '../../domain/roles/roles.js';
import { type AuthContext, CurrentAuth, Roles } from '../auth/index.js';
import { type ElementDetail, ElementsService } from './elements.service.js';
import {
  type LevelView,
  type PlanSummary,
  PlansService,
} from './plans.service.js';
import {
  type StrategyMap,
  StrategyMapService,
} from './strategy-map.service.js';
import {
  type CreateElementInput,
  createElementSchema,
  type CreatePlanInput,
  createPlanSchema,
  idSchema,
  type LevelsInput,
  levelsSchema,
  type UpdatePlanInput,
  updatePlanSchema,
} from './strategy.schemas.js';

const planId = new ZodValidationPipe(idSchema);

@Controller('plans')
export class PlansController {
  constructor(
    private readonly plans: PlansService,
    private readonly maps: StrategyMapService,
    private readonly elements: ElementsService,
  ) {}

  /** All plans (newest first); `isCurrent` marks the one screens open by default. */
  @Get()
  list(): Promise<PlanSummary[]> {
    return this.plans.list();
  }

  /** Strategy map of the current plan. */
  @Get('current/map')
  async currentMap(): Promise<StrategyMap> {
    return this.maps.getMap(await this.plans.currentPlanId());
  }

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(createPlanSchema)) input: CreatePlanInput,
  ): Promise<PlanSummary> {
    return this.plans.create(input);
  }

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Patch(':id')
  update(
    @Param('id', planId) id: string,
    @Body(new ZodValidationPipe(updatePlanSchema)) input: UpdatePlanInput,
  ): Promise<PlanSummary> {
    return this.plans.update(id, input);
  }

  /** Everything the Strategy map screen draws, in one call. */
  @Get(':id/map')
  map(@Param('id', planId) id: string): Promise<StrategyMap> {
    return this.maps.getMap(id);
  }

  @Get(':id/levels')
  levels(@Param('id', planId) id: string): Promise<LevelView[]> {
    return this.plans.levels(id);
  }

  /** Save the whole ordered list of levels: rename, add, remove, reorder. */
  @Roles(...STRATEGY_EDITOR_ROLES)
  @Put(':id/levels')
  replaceLevels(
    @Param('id', planId) id: string,
    @Body(new ZodValidationPipe(levelsSchema)) input: LevelsInput,
  ): Promise<LevelView[]> {
    return this.plans.replaceLevels(id, input);
  }

  /** Add a pillar/objective/…; its level follows from the parent. */
  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post(':id/elements')
  @HttpCode(HttpStatus.CREATED)
  createElement(
    @CurrentAuth() caller: AuthContext,
    @Param('id', planId) id: string,
    @Body(new ZodValidationPipe(createElementSchema)) input: CreateElementInput,
  ): Promise<ElementDetail> {
    return this.elements.create(caller, id, input);
  }
}
