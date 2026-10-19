import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { STRATEGY_EDITOR_ROLES } from '../../domain/roles/roles.js';
import { type AuthContext, CurrentAuth, Roles } from '../auth/index.js';
import { RulesetsService } from './rulesets.service.js';
import {
  idSchema,
  type ProposeRulesetInput,
  proposeRulesetSchema,
  type RulesetImpact,
  type RulesetPreviewInput,
  rulesetPreviewSchema,
  type RulesetsOverview,
  type RulesetView,
} from '@sims/contracts';

const id = new ZodValidationPipe(idSchema);

/** The organisation's rules: versions, impact preview, maker-checker proposals. */
@Controller('rulesets')
export class RulesetsController {
  constructor(private readonly rulesets: RulesetsService) {}

  /** The MD/CEO reads it too, to see what a proposal changes before deciding. */
  @Roles('STRATEGY_OFFICE', 'SYSTEM_ADMIN', 'CEO')
  @Get()
  overview(@CurrentAuth() caller: AuthContext): Promise<RulesetsOverview> {
    return this.rulesets.overview(caller);
  }

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @Body(new ZodValidationPipe(rulesetPreviewSchema))
    input: RulesetPreviewInput,
  ): Promise<RulesetImpact> {
    return this.rulesets.preview(input.config);
  }

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  propose(
    @CurrentAuth() caller: AuthContext,
    @Body(new ZodValidationPipe(proposeRulesetSchema))
    input: ProposeRulesetInput,
  ): Promise<RulesetView> {
    return this.rulesets.propose(caller, input);
  }

  @Roles(...STRATEGY_EDITOR_ROLES)
  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  withdraw(
    @CurrentAuth() caller: AuthContext,
    @Param('id', id) rulesetId: string,
  ): Promise<RulesetView> {
    return this.rulesets.withdraw(caller, rulesetId);
  }
}
